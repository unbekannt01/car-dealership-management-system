/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { User, UserRole, UserStatus } from './user.entity';
import { ClientProxy, ClientProxyFactory, MessagePattern, Transport } from '@nestjs/microservices';
import { UserDto } from './dto/user.dto';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import * as jwt from 'jsonwebtoken';
import { Cron } from '@nestjs/schedule';
import { UpdateUserDto } from './dto/updateuser.dto';

@Injectable()
export class UserService {
  private client: ClientProxy;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject('CAR_SERVICE') private carClient: ClientProxy,
  ) {

    this.carClient = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: ['amqp://localhost:5672'], // RabbitMQ server URL
        queue: 'car_queue',
        queueOptions: {
          durable: false,
        },
      },
    });
  }
  async sendUserInfo(userId: string, email: string, token: string): Promise<void> {
    await this.client.emit('user_info', { userId, email, token }).toPromise();
  }

  // --- Update User Information ---
  async updateUser(email: string, updateUserDto: UpdateUserDto, token: string) {
    if (!token) throw new UnauthorizedException('Invalid Token...')  ;
    if (this.isTokenExpired(token))
      throw new UnauthorizedException('Token Expired...');

    const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;
    if (!decoded || typeof decoded.exp !== 'number')
      throw new UnauthorizedException('Token Expired...');

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('User Not Found...');

    // Check if the authenticated user is trying to update their own information
    if (decoded.email !== email) {
      throw new UnauthorizedException('You can only update your own information...');
    }

    // Update user information
    if (updateUserDto.firstname) user.firstname = updateUserDto.firstname;
    if (updateUserDto.lastname) user.lastname = updateUserDto.lastname;
    if (updateUserDto.username) {
      // Check if the new username is already in use
      const existingUser = await this.userRepository.findOne({ where: { username: updateUserDto.username } });
      if (existingUser && existingUser.id !== user.id) {
        throw new ConflictException('Username already in use');
      }
      user.username = updateUserDto.username;
    }
    if (updateUserDto.mobile_no) user.mobile_no = updateUserDto.mobile_no;
    if (updateUserDto.country) user.country = updateUserDto.country;
    if (updateUserDto.dateOfBirth) user.dateOfBirth = updateUserDto.dateOfBirth;
    if (updateUserDto.email && updateUserDto.email !== email) {
      // Check if the new email is already in use
      const existingUser = await this.userRepository.findOne({ where: { email: updateUserDto.email } });
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
      user.email = updateUserDto.email;
    } 

    await this.userRepository.save(user);

    const { password, loginAttempts, blockedAt, isBlocked, otp, otpExpiration, otpCreate, status, ...cleanUser } = user;

    return { message: 'User information updated successfully', user: cleanUser };
  }
 
  // --- User Registration ---
  async save(userDto: UserDto) {
    const existingdemoUser = await this.userRepository.findOne({
      where: { email: userDto.email },
    });

    if (existingdemoUser) {
      throw new ConflictException(
        'User Already Registered with this Email... So Please Try Different Email... !',
      );
    }

    const user = new User();
    user.id = uuidv4();
    const hashedPassword = await bcrypt.hash(userDto.password, 10);
    userDto.password = hashedPassword;
    await this.userRepository.save(userDto);
  }

  // --- Reset Attempts for Blocked User ---
  async resetAttempts(email: string) {
    const failedLogin = await this.userRepository.findOne({ where: { email } });

    if (failedLogin) {
      failedLogin.loginAttempts = 0;
      await this.userRepository.save(failedLogin);
    }
  }

  // --- Login User ---
  async login(email: string, password: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid User...!')

    // Check if the user is blocked and if the block period has passed
    if (user.isBlocked && user.blockedAt) {
      const currentTime = new Date();
      const unblockTime = new Date(user.blockedAt.getTime() + 12 * 60 * 60 * 1000); // Add 12 Hours to the blocked time
      if (currentTime < unblockTime) {
        throw new UnauthorizedException('Your account has been blocked due to too many failed login attempts. Please try Again After 12 Hours Or Please Contact the admin !');
      } else {
        // If the block period has passed, unblock the user
        user.isBlocked = false;
        user.loginAttempts = 0;
        user.blockedAt = null;
        await this.userRepository.save(user);
      }
    }

    // Check Password if it Valid Or Not
    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      user.loginAttempts++;
      await this.userRepository.save(user);

      if (user.isBlocked || user.loginAttempts >= 5) {
        user.isBlocked = true;
        user.loginAttempts++;
        user.blockedAt = new Date();
        await this.userRepository.save(user);

        // Send blocked email notification
        await this.sendBlockedEmail(user.email, user.firstname);

        throw new UnauthorizedException('User Blocked... !');
      } else {
        throw new UnauthorizedException('Invalid Password... !');
      }
    }

    // Reset login attempts and unblock the user
    user.loginAttempts = 0;
    user.isBlocked = false;
    await this.userRepository.save(user);

    const otp = this.generateRandomotp();
    user.otp = otp;
    user.otpExpiration = new Date(Date.now() + 120000) // 2 Minutes Expiry...
    user.otpCreate = new Date(Date.now());
    await this.userRepository.save(user)

    const token = this.generateToken(user);
    console.log(token)
    // await this.userRepository.save(token)

    const role = user.role;
    const status = UserStatus.VERIFYING;

    // Send OTP via email
    await this.sendOtpEmail(user.email, otp, user.firstname);
    // await this.sendTokenToCarService(user.id, user.email, token);


    return { message: 'OTP Generate Succusessfully... !', role, status, token };
  }

  // --- Unblock User Cron Job ---
  @Cron('* * */12 * * *') // Run every minute
  async unblockUsers() {
    const currentTime = new Date(Date.now() - 12 * 60 * 60 * 1000); // Subtract 12 hours from the current time
    const blockedUsers = await this.userRepository.find({
      where: {
        isBlocked: true,
        blockedAt: LessThan(currentTime), // Find users blocked more than 5 minutes ago
      },
    });

    for (const user of blockedUsers) {
      user.isBlocked = false;
      user.blockedAt = null;
      user.loginAttempts = 0;
      await this.userRepository.save(user);
    }
  }

  // --- Send OTP To Email For Verification ---
  private async sendOtpEmail(email: string, otp: string, firstname: string) {
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
      subject: 'Your OTP for Login Verification',
      text: `Your OTP for verification is ${otp}.`,
      html: `
        <h1 style="color: #333;">Your OTP for Login Verification</h1>
        <p style="font-size: 16px;">Hello ${firstname},</p>
        <p style="font-size: 16px;">Your OTP for verification is <strong>${otp}</strong>.</p>
        <p style="font-size: 16px;">Please use this OTP to complete your login.</p>
        <p style="font-size: 16px;">Thank you.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
  }

  // --- Send Blocked User Email ---
  private async sendBlockedEmail(email: string, firstname: string) {
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
      subject: 'Your Account Has Been Blocked',
      text: `Hello ${firstname}, your account has been blocked due to multiple failed login attempts. Please try again after 12 hours.`,
      html: `
        <h1 style="color: #333;">Account Blocked</h1>
        <p style="font-size: 16px;">Hello ${firstname},</p>
        <p style="font-size: 16px;">Your account has been blocked due to multiple failed login attempts. Please try again after 12 hours.</p>
        <p style="font-size: 16px;">Thank you.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
  }

  // --- Verify OTP For Login User ---
  async verifyotp(otp: string, token: string) {
    if (!token) throw new UnauthorizedException('Invalid Token..');
    if (this.isTokenExpired(token))
      throw new UnauthorizedException('Token Expired..');

    const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;
    if (!decoded || typeof decoded.exp !== 'number')
      throw new UnauthorizedException('Token Expired..');

    const email = decoded.email;
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('User Not Found..');

    if (otp !== user.otp) throw new UnauthorizedException('Invalid OTP..');
    if (Date.now() > user.otpExpiration.getTime())
      throw new UnauthorizedException('OTP Expired');

    await this.userRepository.save(user);

    const status = UserStatus.VERIFIED;

    return { message1: 'OTP Verified Successfully', status };
  }

  // --- OTP Re-send ---
  async resendotp(token: string) {
    if (!token) throw new UnauthorizedException('Invalid Token...!');
    if (this.isTokenExpired(token))
      throw new UnauthorizedException('Token Expired...!')

    const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;
    if (!decoded || typeof decoded.exp !== 'number')
      throw new UnauthorizedException('Token Expired...!');

    const user = await this.userRepository.findOne({ where: { id: decoded.id } })
    if (!user) throw new UnauthorizedException('No OTP Found for the Given Email...!')

    // --- Generate New OTP ---
    const newOtp = this.generateRandomotp();

    // --- Update OTP in the DB ---
    user.otp = newOtp;
    user.otpExpiration = new Date(Date.now() + 120000);
    user.otpCreate = new Date(Date.now())

    await this.userRepository.save(user);

    // --- Send the new OTP via email ---
    await this.sendOtpEmail(user.email, newOtp, user.firstname);

    return { message: 'Re-Generated OTP Successfully...!' }
  }

  // --- Change Password --- 
  async changePwd(email: string, oldpwd: string, newpwd: string, token: string) {
    if (!token) throw new UnauthorizedException('Invalid Token...!');
    if (this.isTokenExpired(token))
      throw new UnauthorizedException('Token Expired...!')

    const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;
    if (!decoded || typeof decoded.exp !== 'number')
      throw new UnauthorizedException('Token Expired...!');

    const user = await this.userRepository.findOne({ where: { email } })
    if (!user) throw new UnauthorizedException('User Not Found...!')

    // --- Verify Old Password ---
    const isValidPassword = await bcrypt.compare(oldpwd, user.password);
    if (!isValidPassword) throw new UnauthorizedException('Invalid Old Password...!')

    // --- New Password --- 
    const newPassword = await bcrypt.hash(newpwd, 10)
    user.password = newPassword;

    if (!newpwd || newpwd === "string")
      throw new UnauthorizedException('Please Enter New Password...!')

    await this.userRepository.save(user);
    return { message: 'Password Successfully Changed...!' }
  }

  // --- Forgot Password Step-1 : Generate OTP & Token --- 
  async forgotpwd(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('User Not Found...!')

    // --- Generate OTP ---
    const otp = this.generateRandomotp();
    user.otp = otp;
    user.otpExpiration = new Date(Date.now() + 120000) // 2 Minutes Expiry...
    user.otpCreate = new Date(Date.now());

    const token = this.generateToken(user);
    console.log(token);

    await this.userRepository.save(user);

    await this.sendOtpEmail(user.email, otp, user.firstname)

    return { message: 'OTP has been Successfully Generated & Sent To Your Email...!' }
  }

  // --- Forgot Password Step-2 : Reset Password ---
  async resetpwd(newpwd: string, token: string) {
    if (!token) throw new UnauthorizedException('Invalid Token...!')
    if (this.isTokenExpired(token))
      throw new UnauthorizedException('Token Expired...!')

    const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;
    if (!decoded || typeof decoded.exp !== 'number')
      throw new UnauthorizedException('Token Expired...!');

    const user = await this.userRepository.findOne({ where: { email: decoded.email } })
    if (!user) throw new UnauthorizedException('User Not Found...!')

    // --- Verify if the New Password is the same as old Password ---
    const isNewPassword = await bcrypt.compare(newpwd, user.password);
    if (isNewPassword) throw new UnauthorizedException('New Password Must be different from the old Passoword...!')

    // --- Reset Password ---
    const newPwd = await bcrypt.hash(newpwd, 10);
    user.password = newPwd;

    if (!newpwd || newpwd === "string") throw new UnauthorizedException('Please Enter a New Password...!');

    await this.userRepository.save(user);

    return { message: 'Password Reset Succssfully...!' }
  }

  // --- Generate Random OTP ---
  generateRandomotp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // --- Generate JWT Token ---
  private generateToken(user: User): string {
    const payload = { id: user.id, email: user.email, role: user.role };
    return jwt.sign(payload, 'hello buddy !', { expiresIn: '24h' }); // Ensure the secret key and expiration are correct
  }

  // --- Token Verification ---
  private isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;
      if (!decoded || typeof decoded.exp !== 'number') {
        return false;
      }
      return Date.now() < decoded.exp * 1000;
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return false;
    }
  }

  // --- Send Birthday Email ----
  private async sendbirthdaymail(email: string, firstname) {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'testing.buddy2401@gmail.com',
        pass: 'jccl bfaz newi vuho',
      },
    })

    const mailOptions = {
      from: 'testing.buddy2401@gmail.com',
      to: email,
      subject: 'BirthDay Wish',
      text: `Many Many Happy Returns Of The Day...  Happy Birthday ${firstname}.`,
    };

    await transporter.sendMail(mailOptions);
  }

  // --- Birthday Cron Job ---
  @Cron('00 00 00 * * *')
  async userbirthday() {
    const users = await this.userRepository.find();
    for (const user of users) {
      const today = new Date();
      const userbirthday = new Date(user.dateOfBirth);

      if (
        today.getDate() === userbirthday.getDate() &&
        today.getMonth() === userbirthday.getMonth()
      ) {
        await this.userRepository.save(user)

        await this.sendbirthdaymail(user.email, user.firstname)
      }
    }
  }

  @MessagePattern({ cmd: 'user_info' })
  async getUserInfo(data: { email: string }): Promise<{ userId: string, email: string }> {
    const user = await this.userRepository.findOne({ where: { email: data.email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { userId: user.id, email: user.email };
  }

  async getUserByEmail(email: string, firstname: string, token: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { email, firstname } });
    if (!user) {
      throw new NotFoundException(`User with email ${email} & ${firstname} not found`);
    }
    return;
  }

  async findOne(email: string): Promise<User> {
    return this.userRepository.findOne({ where: { email } });
  }

  async getUserById(userId: string): Promise<User> {
    return this.userRepository.findOne({ where: { id: userId } });
  }
}

// this.client = ClientProxyFactory.create({
//   transport: Transport.RMQ,
//   options: {
//     urls: ['amqp://localhost:5672'],
//     queue: 'user_queue',
//     queueOptions: {
//       durable: false,
//     },
//   },
// });

// async getUserInfoById(userId: string, email: string): Promise<User> {
//   const user = await this.userRepository.findOne({ where: { id: userId, email: email } });
//   if (!user) {
//     throw new NotFoundException(`User with ID ${userId} not found`);
//   }

//   // We only need a subset of the user data, so we can return a partial object
//   const { password, loginAttempts, blockedAt, isBlocked, otp, otpExpiration, otpCreate, status, ...userInfo } = user;
//   return userInfo as User;
// }
