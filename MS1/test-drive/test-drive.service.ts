/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThanOrEqual, Repository } from 'typeorm';
import { TestDrive } from './entities/test-drive.entity';
import { CreateTestDriveDto } from './dto/test-drive.dto';
import { CarService } from '../car/car.service';
import * as nodemailer from 'nodemailer';
import * as jwt from 'jsonwebtoken'
import { JwtService } from '@nestjs/jwt';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TestDriveRescheduleDto } from './dto/test-drive-reschedule.dto';

@Injectable()
export class TestDriveService {
    private readonly client: ClientProxy;
    constructor(
        @InjectRepository(TestDrive)
        private testDriveRepository: Repository<TestDrive>,
        @Inject(forwardRef(() => CarService))
        private carService: CarService,
        private jwtService: JwtService
    ) {
        this.client = ClientProxyFactory.create({
            transport: Transport.RMQ,
            options: {
                urls: ['amqp://localhost:5672'],
                queue: 'car_queue',
                queueOptions: {
                    durable: false,
                },
            },
        });
    }

    private lastFetchedUserId: string;

    private async processUserInfo(email: string): Promise<{ userId: string, token: string }> {
        await this.client.connect();

        const userInfo = await this.client
            .send({ cmd: 'user_info' }, { email })
            .toPromise();

        if (userInfo && userInfo.error) {
            throw new NotFoundException(userInfo.error);
        }

        if (userInfo && userInfo.userId) {
            this.lastFetchedUserId = userInfo.userId;
            console.log(`Received user info: userId=${userInfo.userId}, email=${userInfo.email}, firstname=${userInfo.firstname}`);
            return { userId: userInfo.userId, token: userInfo.token };
        } else {
            throw new NotFoundException('User information not received from MS2');
        }
    }

    // ---- Register For Test-Drive ----
    async createTestDrive(createTestDriveDto: CreateTestDriveDto, token: string) {
        if (!token) throw new UnauthorizedException('Invalid Token...!');
        if (this.isTokenExpired(token)) throw new UnauthorizedException('Token Expired...!');

        try {
            this.jwtService.verify(token, { secret: 'hello buddy !' });
        } catch (err) {
            throw new UnauthorizedException('Token Expired or Invalid...!');
        }

        const decoded = this.jwtService.verify(token, { secret: 'hello buddy !' })
        const userId = decoded.id;
        const email = decoded.email;

        const car = await this.carService.findByBrand(createTestDriveDto.carBrand);
        if (!car) {
            throw new NotFoundException(`Car with Brand ${createTestDriveDto.carBrand} not found`);
        }

        // Check if this specific timeslot is already booked for this car
        const existingTestDrive = await this.testDriveRepository.findOne({
            where: {
                carId: car.id,
                scheduledDate: createTestDriveDto.scheduledDate,
                scheduledTime: createTestDriveDto.scheduledTime,
                status: In(['Pending', 'Confirmed'])
            }
        });

        if (existingTestDrive) {
            throw new ConflictException('This car is already booked for the selected date and time. Please choose a different time or date.');
        }

        // Check for maximum test drives per day for this car
        const maxTestDrivesPerDay = 5;
        const testDrivesOnDate = await this.testDriveRepository.count({
            where: {
                carId: car.id,
                scheduledDate: createTestDriveDto.scheduledDate,
                status: In(['Pending', 'Confirmed'])
            }
        });

        if (testDrivesOnDate >= maxTestDrivesPerDay) {
            throw new ConflictException('Maximum number of test drives for this car on the selected date has been reached. Please choose a different date.');
        }

        // Check for maximum bookings per month for this user
        const maxUserBookingsPerMonth = 3;
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const userBookingsThisMonth = await this.testDriveRepository.count({
            where: {
                userId: userId,
                createdAt: MoreThanOrEqual(oneMonthAgo),
                status: In(['Pending', 'Confirmed'])
            }
        });

        if (userBookingsThisMonth >= maxUserBookingsPerMonth) {
            throw new BadRequestException('You have reached the maximum number of test drive bookings for this month.');
        }

        const testDrive = this.testDriveRepository.create({
            ...createTestDriveDto,
            email,
            userId: String(userId),
            carId: car.id,
            carBrand: car.carBrand,
            carModel: car.carModel,
            status: 'Pending'
        });

        const savedTestDrive = await this.testDriveRepository.save(testDrive);

        await this.sendInitialBookingEmail(savedTestDrive.email);

        return { message: 'Your Test-Drive has been successfully booked. Please wait for dealer confirmation.' };
    }

    // ---- Confirm Test-Drive By Id For Dealer ----
    async confirmTestDrive(id: string, token: string): Promise<any> {
        if (!token) throw new UnauthorizedException('Invalid Token...!')
        if (this.isTokenExpired(token)) throw new UnauthorizedException('Token Expired..!')

        const decoded = this.jwtService.verify(token, { secret: 'hello buddy !' })
        if (decoded.role !== 'admin')
            throw new UnauthorizedException('You are Not Eligible To Confirm The Test-Drive...!')

        const testDrive = await this.getTestDriveById(id);
        if (testDrive.status !== 'Pending') {
            throw new BadRequestException('Only pending test drives can be confirmed');
        }
        testDrive.status = 'Confirmed';
        const updatedTestDrive = await this.testDriveRepository.save(testDrive);

        await this.sendTestDriveMail(updatedTestDrive);

        return { message: 'Your Test-Drive has been Successfully Booked From The Dealer.' }
    }

    // ----  Get Test-Drive By Id ---- 
    async getTestDriveById(id: string): Promise<TestDrive> {
        const testDrive = await this.testDriveRepository.findOne({ where: { id } });
        if (!testDrive) {
            throw new NotFoundException(`Test drive with ID ${id} not found`);
        }
        return testDrive;
    }

    async updateTestDriveStatus(id: string, status: TestDrive['status']): Promise<TestDrive> {
        const testDrive = await this.getTestDriveById(id);
        testDrive.status = status;
        return this.testDriveRepository.save(testDrive);
    }

    // ---- Reschedule Test-Drive ----
    async rescheduleTestDrive(id: string, testDriveRescheduleDto: TestDriveRescheduleDto, token: string): Promise<any> {
        if (!token) throw new UnauthorizedException('Invalid Token...!');
        if (this.isTokenExpired(token)) throw new UnauthorizedException('Token Expired...!');

        const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;
        if (!decoded || typeof decoded.exp !== 'number')
            throw new UnauthorizedException('Token Expired...!');

        const testDrive = await this.getTestDriveById(id);

        const existingTestDrive = await this.testDriveRepository.findOne({
            where: {
                carId: testDrive.carId,
                scheduledDate: testDriveRescheduleDto.newDate,
                scheduledTime: testDriveRescheduleDto.newTime,
                status: 'Confirmed'
            }
        });

        if (existingTestDrive) {
            throw new BadRequestException('This car is already booked for the selected date and time');
        }

        testDrive.scheduledDate = testDriveRescheduleDto.newDate;
        testDrive.scheduledTime = testDriveRescheduleDto.newTime;
        testDrive.isRescheduled = true;

        await this.sendRescheduleEmail(testDrive)

        await this.testDriveRepository.save(testDrive)

        return { message: 'Your Test-Drive has been Successfully Re-scheduled...!' }
    }

    private async sendRescheduleEmail(testDrive: TestDrive) {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: 'testing.buddy2401@gmail.com',
                pass: 'jccl bfaz newi vuho',
            },
        });

        const mailOptions = {
            from: '<testing.buddy2401@gmail.com>',
            to: testDrive.email,
            subject: 'Your Test Drive Has Been Rescheduled',
            html: `
            <div style="font-family: Arial, sans-serif; background-color: #f2f2f2; padding: 20px; border-radius: 10px;">
              <h2 style="color: #004a8f;">Your Test Drive Has Been Rescheduled</h2>
              <p style="font-size: 16px;">Dear Customer,</p>
              <p style="font-size: 16px;">Your test drive for the <strong>${testDrive.carModel}</strong> has been rescheduled.</p>
              <p style="font-size: 16px;">New details of your test drive:</p>
              <ul style="font-size: 16px;">
                <li>New Date: <strong>${testDrive.scheduledDate}</strong></li>
                <li>New Time: <strong>${testDrive.scheduledTime}</strong></li>
                <li>Dealer Name: <strong>${testDrive.dealerName}</strong></li>
                <li>Dealer Address: <strong>A-22(KP-Group), Mall Road, Near NCR, Delhi</strong></li>
              </ul>
              <p style="font-size: 16px;">If you have any questions or need to make further changes, please don't hesitate to contact us.</p>
              <p style="font-size: 16px;">We look forward to seeing you!</p>
              <p style="font-size: 16px;">Best Regards,<br/>Your Car Dealership Team</p>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
    }

    // --- Cancel Test-Drive ---
    async cancelTestDrive(id: string, token: string, reason: string): Promise<{ message: string }> {
        if (!token) {
            throw new UnauthorizedException('Invalid Token...!');
        }

        if (this.isTokenExpired(token)) {
            throw new UnauthorizedException('Token Expired...!');
        }

        let isDealer = false;
        try {
            // Verify and decode the token to get the role (isAdmin or isUser)
            const decodedToken = this.jwtService.verify(token, { secret: 'hello buddy !' }) as { role: string };
            isDealer = decodedToken.role === 'admin';
        } catch (err) {
            throw new UnauthorizedException('Token Expired or Invalid...!');
        }

        // Get test drive details and update status to Cancelled
        const testDrive = await this.getTestDriveById(id);
        await this.updateTestDriveStatus(id, 'Cancelled');

        // Send cancellation email
        await this.sendCancellationEmail(testDrive, reason, isDealer);

        // Return success message
        return { message: 'Your test drive has been successfully cancelled.' };
    }

    private async sendCancellationEmail(testDrive: TestDrive, reason: string, isDealer: boolean) {
        const subject = isDealer ? 'Your Test Drive Has Been Cancelled by Dealer' : 'Your Test Drive Has Been Cancelled';
        const body = isDealer
            ? `We regret to inform you that your test drive for the <strong>${testDrive.carModel}</strong> scheduled for ${testDrive.scheduledDate} at ${testDrive.scheduledTime} has been cancelled by the dealer.`
            : `We regret to inform you that your test drive for the <strong>${testDrive.carModel}</strong> scheduled for ${testDrive.scheduledDate} at ${testDrive.scheduledTime} has been cancelled by you.`;

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: 'testing.buddy2401@gmail.com',
                pass: 'jccl bfaz newi vuho',
            },
        });

        const mailOptions = {
            from: '<testing.buddy2401@gmail.com>',
            to: testDrive.email,
            subject: subject,
            html: `
            <div style="font-family: Arial, sans-serif; background-color: #f2f2f2; padding: 20px; border-radius: 10px;">
              <h2 style="color: #004a8f;">${subject}</h2>
              <p style="font-size: 16px;">Dear Customer,</p>
              <p style="font-size: 16px;">${body}</p>
              <p style="font-size: 16px;">Cancellation Reason: ${reason}</p>
              <p style="font-size: 16px;">If you would like to reschedule your test drive or have any questions, please don't hesitate to contact us.</p>
              <p style="font-size: 16px;">Best Regards,<br/>Your Car Dealership Team</p>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
    }


    async getPendingTestDrives(): Promise<any> {
        const testDrives = await this.testDriveRepository
            .createQueryBuilder('testdrive')
            .select(['testdrive.carBrand', 'testdrive.carModel', 'testdrive.id', 'testdrive.email'])
            .where('testdrive.status = :status')
            .setParameters({ status: 'pending' })
            .getMany();

        if (testDrives.length === 0) {
            return { message: 'There are no pending test drives' };
        }

        return testDrives;
    }

    async getAllTestDrives(): Promise<any> {
        const testDrives = await this.testDriveRepository.find({
            select: ['id', 'carBrand', 'carModel', 'email', 'scheduledDate', 'scheduledTime', 'status'],
            order: { scheduledDate: 'DESC' }
        });

        if (testDrives.length === 0) {
            return { message: 'There are no test drives available' };
        }

        return testDrives.map(drive => ({
            id: drive.id,
            carBrand: drive.carBrand,
            carModel: drive.carModel,
            email: drive.email,
            scheduledDate: drive.scheduledDate,
            scheduledTime: drive.scheduledTime,
            status: drive.status
        }));
    }

    private async sendTestDriveMail(data: {
        email: string;
        scheduledDate: string;
        scheduledTime: string;
        dealerName: string;
        carBrand: string,
        carModel: string;
        dealerAddress: string;
    }) {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: 'testing.buddy2401@gmail.com',
                pass: 'jccl bfaz newi vuho',
            },
        });

        const mailOptions = {
            from: '<testing.buddy2401@gmail.com>',
            to: data.email,
            subject: 'Test Drive Booking Confirmation',
            html: `
        <div style="font-family: Arial, sans-serif; background-color: #f2f2f2; padding: 20px; border-radius: 10px;">
          <h2 style="color: #004a8f;">Your Test Drive is Confirmed!</h2>
          <p style="font-size: 16px;">Dear Customer,</p>
          <p style="font-size: 16px;">Thank you for booking a test drive for the <strong>${data.carModel}</strong>.</p>
          <p style="font-size: 16px;">Here are the details of your test drive:</p>
          <ul style="font-size: 16px;">
            <li>Car Brand: <strong>${data.carBrand}</strong></li>
            <li>Car Model: <strong>${data.carModel}</strong></li>
            <li>Scheduled Date: <strong>${data.scheduledDate}</strong></li>
            <li>Scheduled Time: <strong>${data.scheduledTime}</strong></li>
            <li>Dealer Name: <strong>${data.dealerName}</strong></li>
            <li>Dealer Address: <strong>${data.dealerAddress}</strong></li>
          </ul>
          <p style="font-size: 16px;">We look forward to seeing you and hope you enjoy the driving experience.</p>
          <p style="font-size: 16px;">Please feel free to contact us if you have any questions or need further assistance.</p>
          <p style="font-size: 16px;">Best Regards,<br/>Your Car Dealership Team</p>
        </div>
      `,
        };
        await transporter.sendMail(mailOptions);
    }

    private async sendInitialBookingEmail(email: string) {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: 'testing.buddy2401@gmail.com',
                pass: 'jccl bfaz newi vuho',
            },
        });
        const mailOptions = {
            from: '<testing.buddy2401@gmail.com>',
            to: email,
            subject: 'Test Drive Booking Received',
            html: `
            <div style="font-family: Arial, sans-serif; background-color: #f2f2f2; padding: 20px; border-radius: 10px;">
              <h2 style="color: #004a8f;">Your Test Drive Booking is Received</h2>
              <p style="font-size: 16px;">Dear Customer,</p>
              <p style="font-size: 16px;">Thank you for booking a test drive with us.</p>
              <p style="font-size: 16px;">Your booking has been received and is pending confirmation from our dealer.</p>
              <p style="font-size: 16px;">Once the dealer confirms your test drive, you will receive another email with all the details.</p>
              <p style="font-size: 16px;">If you have any questions, please don't hesitate to contact us.</p>
              <p style="font-size: 16px;">Best Regards,<br/>Your Car Dealership Team</p>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async sendReminders() {
        const now = new Date();
        // this.logger.log('Cron job running at:', new Date());
        const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const upcomingTestDrives = await this.testDriveRepository.find({
            where: {
                scheduledDate: Between(
                    now.toISOString().split('T')[0],
                    twentyFourHoursLater.toISOString().split('T')[0]
                ),
                status: 'Confirmed'
            }
        });

        for (const testDrive of upcomingTestDrives) {
            const testDriveTime = this.combineDateAndTime(testDrive.scheduledDate, testDrive.scheduledTime);
            if (testDriveTime) {
                const timeDiff = testDriveTime.getTime() - now.getTime();
                const hoursDiff = timeDiff / (1000 * 60 * 60);

                const minutesDiff = (hoursDiff % 1) * 60;

                if (Math.floor(hoursDiff) === 24 && minutesDiff < 1) {
                    await this.sendReminderEmail(testDrive, '24 hours');
                } else if (Math.floor(hoursDiff) === 12 && minutesDiff < 1) {
                    await this.sendReminderEmail(testDrive, '12 hours');
                }
            }
        }
    }

    private combineDateAndTime(dateString: string, timeString: string): Date | null {
        try {
            const [year, month, day] = dateString.split('-').map(Number);
            const [hours, minutes] = timeString.split(':').map(Number);
            return new Date(year, month - 1, day, hours, minutes);
        } catch (error) {
            console.error('Error parsing date or time:', error);
            return null;
        }
    }

    private async sendReminderEmail(testDrive: TestDrive, reminderType: string) {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: 'testing.buddy2401@gmail.com',
                pass: 'jccl bfaz newi vuho',
            },
        });

        const subject = `Reminder: Your Test Drive is in ${reminderType}`;

        const mailOptions = {
            from: '<testing.buddy2401@gmail.com>',
            to: testDrive.email,
            subject: subject,
            html: `
        <div style="font-family: Arial, sans-serif; background-color: #f2f2f2; padding: 20px; border-radius: 10px;">
          <h2 style="color: #004a8f;">${subject}</h2>
          <p style="font-size: 16px;">Dear Customer,</p>
          <p style="font-size: 16px;">This is a friendly reminder that your test drive for the <strong>${testDrive.carModel}</strong> is scheduled in ${reminderType}.</p>
          <p style="font-size: 16px;">Here are the details of your test drive:</p>
          <ul style="font-size: 16px;">
            <li>Car Brand: <strong>${testDrive.carBrand}</strong></li>
            <li>Car Model: <strong>${testDrive.carModel}</strong></li>
            <li>Scheduled Date: <strong>${testDrive.scheduledDate}</strong></li>
            <li>Scheduled Time: <strong>${testDrive.scheduledTime}</strong></li>
            <li>Dealer Name: <strong>${testDrive.dealerName}</strong></li>
            <li>Dealer Address: <strong>${testDrive.dealerAddress}</strong></li>
          </ul>
          <p style="font-size: 16px;">We look forward to seeing you!</p>
          <p style="font-size: 16px;">If you need to reschedule or have any questions, please contact us as soon as possible.</p>
          <p style="font-size: 16px;">Best Regards,<br/>Your Car Dealership Team</p>
        </div>
      `,
        };

        await transporter.sendMail(mailOptions);
    }

    async getScheduledTestDrivesForCar(carId: string): Promise<TestDrive[]> {
        return this.testDriveRepository.find({
            where: {
                carId: carId,
                status: In(['Pending', 'Confirmed'])
            }
        });
    }

    async cancelTestDriveAndNotify(testDriveId: string, reason: string): Promise<void> {
        const testDrive = await this.getTestDriveById(testDriveId);
        await this.updateTestDriveStatus(testDriveId, 'Cancelled');
        await this.sendApologyEmail(testDrive, reason);
    }

    private async sendApologyEmail(testDrive: TestDrive, reason: string) {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: 'testing.buddy2401@gmail.com',
                pass: 'jccl bfaz newi vuho',
            },
        });

        const mailOptions = {
            from: '<testing.buddy2401@gmail.com>',
            to: testDrive.email,
            subject: 'Test Drive Cancellation Notice',
            html: `
            <div style="font-family: Arial, sans-serif; background-color: #f2f2f2; padding: 20px; border-radius: 10px;">
              <h2 style="color: #004a8f;">Test Drive Cancellation Notice</h2>
              <p style="font-size: 16px;">Dear Customer,</p>
              <p style="font-size: 16px;">We regret to inform you that your test drive for the <strong>${testDrive.carModel}</strong> scheduled for ${testDrive.scheduledDate} at ${testDrive.scheduledTime} has been cancelled.</p>
              <p style="font-size: 16px;">Reason for cancellation: ${reason}</p>
              <p style="font-size: 16px;">We sincerely apologize for any inconvenience this may cause. If you would like to schedule a test drive for a similar model or explore other options, please don't hesitate to contact us.</p>
              <p style="font-size: 16px;">Thank you for your understanding.</p>
              <p style="font-size: 16px;">Best Regards,<br/>Your Car Dealership Team</p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
    }

    // --- Token Verification ----
    private isTokenExpired(token: string): boolean {
        const decoded = jwt.decode(token) as jwt.JwtPayload;
        console.log('Decoded token:', decoded);
        if (!decoded || typeof decoded.exp !== 'number') {
            return true;
        }
        const currentTime = Date.now() / 1000;
        console.log('Current time:', currentTime, 'Token expiration:', decoded.exp);
        return currentTime >= decoded.exp;
    }

    async getTestDrivesByUser(userId: string, startDate: Date, endDate: Date): Promise<TestDrive[]> {
        return this.testDriveRepository.find({
            where: {
                userId: userId,
                scheduledDate: Between(startDate.toISOString(), endDate.toISOString())
            }
        });
    }

}