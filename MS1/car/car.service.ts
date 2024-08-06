/* eslint-disable prettier/prettier */
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Car } from './car.entity';
import { CreateCarDto } from './dto/car.dto';
import {
  ClientProxy,
  ClientProxyFactory,
  Transport,
} from '@nestjs/microservices';
import * as nodemailer from 'nodemailer';
import * as jwt from 'jsonwebtoken';
import { JwtService } from '@nestjs/jwt';
import { TestDriveService } from 'src/test-drive/test-drive.service';
import * as moment from 'moment';
import { CarTransaction } from './carTransaction.entity';
import { TestDrive } from 'src/test-drive/entities/test-drive.entity';
import { UpdateCarDto } from './dto/updatecar.dto';
import { FilterAllCarsDto } from './dto/filterAllCars.dto';
import { FilterCarDto } from './dto/filter.dto';

@Injectable()
export class CarService {
  private readonly client: ClientProxy;
  private readonly logger = new Logger(CarService.name);
  constructor(
    @InjectRepository(Car)
    private readonly carRepository: Repository<Car>,
    @InjectRepository(CarTransaction)
    private readonly transactionRepository: Repository<CarTransaction>,
    @InjectRepository(TestDrive)
    private readonly testDriveRepository: Repository<TestDrive>, // Ensure correct injection
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => TestDriveService))
    private readonly testDriveService: TestDriveService,
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

  async processUserInfo(email: string): Promise<string> {
    await this.client.connect();

    const userInfo = await this.client
      .send({ cmd: 'user_info' }, { email })
      .toPromise();

    if (userInfo && userInfo.userId && userInfo.email) {
      this.lastFetchedUserId = userInfo.userId;
      console.log(
        `Received user info: userId=${userInfo.userId}, email=${userInfo.email}, firstname=${userInfo.firstname}`,
      );
      return userInfo.userId, userInfo.token;
    } else {
      throw new NotFoundException('User information not received from MS2');
    }
  }

  async create(carDto: CreateCarDto, token: string) {
    if (!token) {
      throw new UnauthorizedException('Invalid Token...!');
    }

    if (this.isTokenExpired(token))
      throw new UnauthorizedException('Token Expired...!');

    const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;

    const userId = decoded.id;
    const email = decoded.email;
    const role = decoded.role;

    let currentOwnerType: 'dealer' | 'user';
    let availableForTestDrive: boolean;

    if (role === 'admin') {
      currentOwnerType = 'dealer';
      availableForTestDrive = true;
    } else {
      currentOwnerType = 'user';
      availableForTestDrive = false;
    }

    const newCar = this.carRepository.create({
      ...carDto,
      currentOwnerId: userId,
      email: email,
      updatedAt: new Date().toLocaleString(),
      status: 'for_sale', // Fixed status
      currentOwnerType: currentOwnerType,
      availableForTestDrive: availableForTestDrive,
      isAvailableForSale: true,
    });

    const savedCar = await this.carRepository.save(newCar);

    return {
      ...savedCar,
      message: 'Car registered successfully',
      ownerId: userId,
      email: email,
    };
  }

  async findAll(): Promise<Car[]> {
    return this.carRepository.find();
  }

  async findAllWithPagination(
    filterAllCars: FilterCarDto,
  ): Promise<{ cars: Car[]; totalCars: number; totalPages: number }> {
    const { page, limit } = filterAllCars;

    const query = this.carRepository.createQueryBuilder('car');

    const totalCars = await query.getCount();
    const totalPages = Math.ceil(totalCars / limit);

    const cars = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    if (cars.length === 0) {
      throw new NotFoundException('No cars found matching the criteria');
    }

    return { cars, totalPages, totalCars };
  }

  async findCarByUserId(userId: string): Promise<Car> {
    const car = await this.carRepository.findOne({
      where: { currentOwnerId: userId },
    });
    if (!car) {
      throw new NotFoundException(`Car for user with ID ${userId} not found`);
    }
    return car;
  }

  async getCarsById(carId: string): Promise<Car> {
    const car = await this.carRepository.findOne({ where: { id: carId } });
    if (!car) {
      console.log(`Car with ID ${carId} not found`);
      throw new NotFoundException(`Car with ID ${carId} not found`);
    }

    return car;
  }

  async update(carId: string, carData: UpdateCarDto): Promise<Car> {
    const car = await this.carRepository.findOne({ where: { id: carId } });
    if (!car) throw new UnauthorizedException('Car Details Not Found...');
    await this.carRepository.update(carId, {
      ...carData,
      currentOwnerId: String(carId), // Cast ownerId to string
    });
    return this.findOne(carId);
  }

  async delete(carId: string): Promise<Car> {
    const car = await this.carRepository.findOne({ where: { id: carId } });
    if (!car) throw new UnauthorizedException('Car Details Not Found...');
    await this.carRepository.delete(carId);
    return car;
  }

  async buyCar(
    carId: string,
    token: string,
  ): Promise<{ transaction: CarTransaction; updatedCar: Car }> {
    if (!token) throw new UnauthorizedException('Invalid Token...!');
    if (this.isTokenExpired(token))
      throw new UnauthorizedException('Token Expired...!');

    const decoded = this.jwtService.verify(token, { secret: 'hello buddy !' });
    const buyerId = decoded.id;
    const buyerEmail = decoded.email;

    const car = await this.carRepository.findOne({ where: { id: carId } });
    if (!car) {
      throw new NotFoundException('Car not found');
    }

    if (car.availableForTestDrive) {
      await this.testDriveService.cancelTestDriveAndNotify
    }

    if (car.currentOwnerType !== 'dealer' || car.status !== 'for_sale') {
      throw new UnauthorizedException(
        'This car is not available for purchase from the dealer',
      );
    }

    if (car.availableForTestDrive) {
      // Get scheduled test drives for this specific car
      const scheduledTestDrives = await this.testDriveService.getScheduledTestDrivesForCar(carId);

      // Cancel all scheduled test drives for this car and send apology emails
      for (const testDrive of scheduledTestDrives) {
        await this.testDriveService.cancelTestDriveAndNotify(
          testDrive.id,
          'We apologize, but the car you were scheduled to test drive has been sold.'
        );
      }
    }

    const buyingPrice = car.price;

    // Create new transaction
    const transaction = new CarTransaction();
    transaction.car = car;
    transaction.sellerId = car.currentOwnerId;
    transaction.sellerType = 'dealer';
    transaction.buyerId = buyerId;
    transaction.buyerType = 'user';
    transaction.buyerEmail = buyerEmail;
    transaction.transactionType = 'buy';
    transaction.price = buyingPrice;
    transaction.transactionDateTime = new Date();

    await this.transactionRepository.save(transaction);

    // Update car details
    car.previousOwnerId = car.currentOwnerId;
    car.currentOwnerId = buyerId;
    car.currentOwnerType = 'user';
    car.status = 'sold';
    car.availableForTestDrive = false;
    car.isAvailableForSale = false;
    car.price = buyingPrice;

    const updatedCar = await this.carRepository.save(car);

    await this.sendPurchaseEmail(
      buyerEmail,
      car.carModel,
      car.carBrand,
      buyingPrice,
    );

    return { transaction, updatedCar };
  }

  // ---- Send Email For Purchase Car ----
  async sendPurchaseEmail(
    email: string,
    carModel: string,
    carBrand: string,
    buyingPrice: number,
  ) {
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
      subject: 'Car Purchase Confirmation',
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #f2f2f2; padding: 20px; border-radius: 10px;">
          <h2 style="color: #004a8f;">Congratulations on Your New Car Purchase!</h2>
          <p style="font-size: 16px;">Dear Customer,</p>
          <p style="font-size: 16px;">We are thrilled to inform you that your purchase of a <strong>${carModel}</strong> has been successfully processed.</p>
          <p style="font-size: 16px;">Transaction Details:</p>
          <ul style="font-size: 16px;">
            <li>Car Brand: <strong>${carBrand}</strong></li>
            <li>Car Model: <strong>${carModel}</strong/trong></li>
            <li>Price: <strong>Rs.${buyingPrice}</strong></li>
            <li>Purchase Date: <strong>${new Date().toLocaleString()}</strong></li>
          </ul>
          <p style="font-size: 16px;">Thank you for choosing our services. Please feel free to contact us if you have any questions or need further assistance.</p>
          <p style="font-size: 16px;">Best Regards,<br/>Your Car Dealership Team</p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
  }

  async sellCar(
    carId: string,
    token: string,
  ): Promise<{ transaction: CarTransaction; updatedCar: Car }> {
    if (!token) throw new UnauthorizedException('Invalid Token');
    if (this.isTokenExpired(token)) throw new UnauthorizedException('Token Expired...!');

    const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;
    
    const sellerId = decoded.id;
    const sellerEmail = decoded.email;

    const car = await this.carRepository.findOne({ where: { id: carId } });
    if (!car || car.currentOwnerId !== sellerId) {
      throw new UnauthorizedException('You cannot sell this car');
    }

    const dealer = await this.carRepository.findOne({
      where: {
        currentOwnerType: 'dealer',
        dealerName: 'KP Group', // Assuming this is the main dealer
      },
    });

    if (!dealer) {
      throw new NotFoundException('Main dealer not found in the system');
    }

    // Create new transaction
    const transaction = new CarTransaction();
    transaction.car = car;
    transaction.sellerId = sellerId;
    transaction.sellerType = 'user';
    transaction.buyerId = dealer.currentOwnerId;
    transaction.buyerType = 'dealer';
    transaction.transactionType = 'sell';
    transaction.price = car.price;
    transaction.transactionDateTime = new Date();
    transaction.sellerEmail = sellerEmail;

    await this.transactionRepository.save(transaction);

    // Update car details
    car.previousOwnerId = sellerId;
    car.currentOwnerId = dealer.currentOwnerId;
    car.currentOwnerType = 'dealer';
    car.status = 'for_sale';
    car.availableForTestDrive = true;

    const updatedCar = await this.carRepository.save(car);

    await this.sendSellCarEmail(
      sellerEmail,
      car.carModel,
      car.carBrand,
      car.price,
    );

    return { transaction, updatedCar };
  }

  // ---- Send Email For Sell Car ----
  private async sendSellCarEmail(
    email: string,
    carModel: string,
    carBrand: string,
    price: number,
  ) {
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
      subject: 'Car Sold Confirmation',
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #f2f2f2; padding: 20px; border-radius: 10px;">
          <h2 style="color: #004a8f;">Congratulations on Selling Your Car!</h2>
          <p style="font-size: 16px;">Dear Seller,</p>
          <p style="font-size: 16px;">We are pleased to confirm that your car, <strong>${carBrand}</strong>, has been successfully sold to <strong>K.P. Dealer</strong>.</p>
          <p style="font-size: 16px;">Sale Details:</p>
          <ul style="font-size: 16px;">
            <li>Car Brand: <strong>${carBrand}</strong>
            <li>Car Model: <strong>${carModel}</strong></li>
            <li>Sale Price: <strong>Rs.${price}</strong></li>
            <li>Sale Date: <strong>${new Date().toLocaleString()}</strong></li>
          </ul>
          <p style="font-size: 16px;">Thank you for using our services. If you have any questions or need further assistance, please do not hesitate to contact us.</p>
          <p style="font-size: 16px;">Best Regards,<br/>Your Car Dealership Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
  }

  async getAvailableCarsForSaleAndTestDrive(
    token: string,
  ): Promise<{ cars: Car[]; totalCars: number }> {
    if (!token) throw new UnauthorizedException('Invalid Token...!');
    if (this.isTokenExpired(token))
      throw new UnauthorizedException('Token Expired...!');

    // const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;

    // const userId = decoded.id;
    // const userRole = decoded.role;
    // if (!userRole || !userId) {
    //   throw new UnauthorizedException(
    //     'Token does not contain necessary information',
    //   );
    // }

    const query = this.carRepository
      .createQueryBuilder('car')
      .select([
        'car.email',
        'car.carBrand',
        'car.carModel',
        'car.manufacturing_year',
        'car.price',
        'car.color',
        'car.isAvailableForSale',
        'car.availableForTestDrive',
        'car.details',
        'car.status',
      ]);

    // query = query.where('car.currentOwnerId = :userId', { userId });

    // if (userRole === 'admin') {
    //   // Admin can see cars they own (bought from users or already in their possession)
    //   query = query.where('car.currentOwnerId = :userId', { userId });
    // } else if (userRole === 'user') {
    //   // Users can see cars they own (bought or already in their possession)
    //   query = query.where('car.currentOwnerId = :userId', { userId });
    // } else {
    //   throw new UnauthorizedException('Invalid user role');
    // }

    const [cars, totalCars] = await query.getManyAndCount();

    return { cars, totalCars };
  }

  async filterCars(filterDto: FilterAllCarsDto): Promise<{
    filter: {
      data;
      manufacturingYears: { startYear: number; endYear: number };
      priceRange: { min: number; max: number };
    };
    search: string;
    page: { pageLimit: number; pageNumber: number };
    sort: { orderBy: string; sortBy: string };
    totalCars: number;
    totalPages: number;
    currentPage: number;
    pageLimit: number;
  }> {
    const {
      carBrands = [],
      startYear = 0,
      endYear = 0,
      minPrice: min = 0,
      maxPrice: max = Number.MAX_SAFE_INTEGER,
      search = '',
      pageLimit = 10,
      pageNumber = 1,
      orderBy = 'ASC',
      sortBy = 'carModel',
    } = filterDto;

    const query = this.carRepository.createQueryBuilder('car');

    if (carBrands.length > 0) {
      query.andWhere('car.carBrand IN (:...carBrands)', { carBrands });
    }

    if (startYear !== 0 || endYear !== 0) {
      if (startYear !== 0 && endYear !== 0) {
        query.andWhere(
          'car.manufacturing_year BETWEEN :startYear AND :endYear',
          {
            startYear,
            endYear,
          },
        );
      } else if (startYear !== 0) {
        query.andWhere('car.manufacturing_year >= :startYear', { startYear });
      } else if (endYear !== 0) {
        query.andWhere('car.manufacturing_year <= :endYear', { endYear });
      }
    }

    query.andWhere('car.price BETWEEN :minPrice AND :maxPrice', {
      minPrice: min,
      maxPrice: max,
    });

    if (search) {
      query.andWhere('car.carModel LIKE :search', { search: `%${search}%` });
    }

    query.orderBy(`car.${sortBy}`, orderBy);

    const totalCars = await query.getCount();
    const totalPages = Math.ceil(totalCars / pageLimit);

    const cars = await query
      .select(['car'])
      .skip((pageNumber - 1) * pageLimit)
      .take(pageLimit)
      .getMany();
 
    if (cars.length === 0) {
      throw new NotFoundException('No cars found matching the criteria');
    }

    return {
      filter: {
        data: cars,
        manufacturingYears: { startYear, endYear },
        priceRange: { min, max },
      },
      search,
      page: { pageLimit, pageNumber },
      sort: { orderBy, sortBy },
      totalCars,
      totalPages,
      currentPage: pageNumber,
      pageLimit,
    };
  }

  async getAvailableCarsForSale() {
    const cars = await this.carRepository.find({
      where: {
        status: 'for_sale',
      },
    });
    return cars.map((car) => car);
  }

  async getDealerSalesReport(
    dealerId: string,
  ): Promise<{ totalSales: number; totalRevenue: number }> {
    const sales = await this.transactionRepository.find({
      where: {
        sellerId: dealerId,
        sellerType: 'dealer',
        transactionType: 'sell',
        // transactionDate: Between(startDate, endDate),
      },
    });

    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.price, 0);

    return { totalSales, totalRevenue };
  }

  private formatDate(date: Date | null): string | null {
    return date ? moment(date).format('DD-MM-YYYY HH:mm:ss') : null;
  }

  // ---- Token Verification ----
  private isTokenExpired(token: string): boolean {
    const decoded = jwt.verify(token, 'hello buddy !') as jwt.JwtPayload;
    if (!decoded || typeof decoded.exp !== 'number') {
      return true;
    }
    return Date.now() >= decoded.exp * 1000;
  }

  async getUserReport( 
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    user: { id: string; email: string };
    transactions: {
      type: 'buy' | 'sell';
      car: {
        id: string;
        carBrand: string;
        carModel: string;
        manufacturing_year: number;
        color: string;
        price: number;
      };
      transactionDate: Date;
    }[];
    testDrives: {
      carBrand: string;
      carModel: string;
      scheduledDate: Date;
    }[];
    summary: {
      soldCars: number;
      boughtCars: number;
      totalExpense: number;
      totalIncome: number;
      totalTestDrives: number;
    };
  }> {
    const user = userId;
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.car', 'car')
      .where(
        'transaction.buyerId = :userId OR transaction.sellerId = :userId',
        { userId },
      );

    if (startDate && endDate) {
      query.andWhere(
        'transaction.transactionDateTime BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    }

    const transactions = await query.getMany();

    const testDriveQuery = this.testDriveRepository
      .createQueryBuilder('testDrive')
      .where('testDrive.userId = :userId', { userId });

    if (startDate && endDate) {
      testDriveQuery.andWhere(
        'testDrive.scheduledDate BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    }

    const testDrives = await testDriveQuery.getMany();

    const soldCars = transactions.filter((t) => t.sellerId === userId).length;
    const boughtCars = transactions.filter((t) => t.buyerId === userId).length;
    const totalExpense = transactions
      .filter((t) => t.buyerId === userId)
      .reduce((sum, t) => sum + t.price, 0);
    const totalIncome = transactions
      .filter((t) => t.sellerId === userId)
      .reduce((sum, t) => sum + t.price, 0);

    return {
      user: { id: userId, email: userId },
      transactions: transactions.map((t) => ({
        type: t.buyerId === userId ? 'buy' : 'sell',
        car: {
          id: t.car.id,
          carBrand: t.car.carBrand,
          carModel: t.car.carModel,
          manufacturing_year: t.car.manufacturing_year,
          color: t.car.color,
          price: t.price,
        },
        transactionDate: new Date(t.transactionDateTime), // String se Date mein convert kiya
      })),
      testDrives: testDrives.map((td) => ({
        carBrand: td.carBrand,
        carModel: td.carModel,
        scheduledDate: new Date(td.scheduledDate), // String se Date mein convert kiya
      })),
      summary: {
        soldCars,
        boughtCars,
        totalExpense,
        totalIncome,
        totalTestDrives: testDrives.length,
      },
    };
  }

  async getDealerReport(
    dealerId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    dealer: { id: string; email: string; name: string };
    transactions: {
      type: 'buy' | 'sell';
      car: {
        id: string;
        carBrand: string;
        carModel: string;
        manufacturing_year: number;
        color: string;
        price: number;
      };
      transactionDate: Date;
    }[];
    testDrives: {
      id: string;
      carBrand: string;
      carModel: string;
      scheduledDate: Date;
      userId: string;
      status: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
    }[];
    summary: {
      soldCars: number;
      boughtCars: number;
      totalExpense: number;
      totalIncome: number;
      totalTestDrives: number;
    };
  }> {
    const dealer = await this.carRepository.findOne({
      where: {
        currentOwnerType: 'dealer',
        dealerName: 'KP Group', // Assuming this is the main dealer
      },
    });

    if (!dealer) {
      throw new NotFoundException('Main dealer not found in the system');
    }

    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.car', 'car')
      .where(
        'transaction.buyerId = :dealerId OR transaction.sellerId = :dealerId',
        { dealerId },
      );

    if (startDate && endDate) {
      query.andWhere(
        'transaction.transactionDateTime BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    }

    const transactions = await query.getMany();

    // Fetch all cars owned by the dealer
    const dealerCars = await this.carRepository.find({
      where: { currentOwnerId: dealerId, currentOwnerType: 'dealer' },
    });

    // Get all car IDs owned by the dealer
    const dealerCarIds = dealerCars.map((car) => car.id);

    // Fetch test drives for cars owned by the dealer
    const testDriveQuery = this.testDriveRepository
      .createQueryBuilder('testDrive')
      .where('testDrive.carId IN (:...carIds)', { carIds: dealerCarIds });

    if (startDate && endDate) {
      testDriveQuery.andWhere(
        'testDrive.scheduledDate BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    }

    const testDrives = await testDriveQuery.getMany();

    const soldCars = transactions.filter((t) => t.sellerId === dealerId).length;
    const boughtCars = transactions.filter(
      (t) => t.buyerId === dealerId,
    ).length;
    const totalExpense = transactions
      .filter((t) => t.buyerId === dealerId)
      .reduce((sum, t) => sum + t.price, 0);
    const totalIncome = transactions
      .filter((t) => t.sellerId === dealerId)
      .reduce((sum, t) => sum + t.price, 0);

    return {
      dealer: { id: dealer.id, email: dealer.email, name: dealer.dealerName },
      transactions: transactions.map((t) => ({
        type: t.buyerId === dealerId ? 'buy' : 'sell',
        car: {
          id: t.car.id,
          carBrand: t.car.carBrand,
          carModel: t.car.carModel,
          manufacturing_year: t.car.manufacturing_year,
          color: t.car.color,
          price: t.price,
        },
        transactionDate: new Date(t.transactionDateTime),
      })),
      testDrives: testDrives.map((td) => ({
        id: td.id,
        carBrand: td.carBrand,
        carModel: td.carModel,
        scheduledDate: new Date(td.scheduledDate),
        userId: td.userId,
        status: td.status as
          | 'Pending'
          | 'Confirmed'
          | 'Completed'
          | 'Cancelled',
      })),
      summary: {
        soldCars,
        boughtCars,
        totalExpense,
        totalIncome,
        totalTestDrives: testDrives.length,
      },
    };
  }

  async findOne(carId: string): Promise<Car> {
    return this.carRepository.findOne({ where: { id: carId } });
  }

  async findByBrand(carBrand: string): Promise<Car> {
    return this.carRepository.findOne({ where: { carBrand } });
  }

}

// async filterCars(filterDto: FilterCarDto): Promise<{ cars: Car[], totalCars: number, totalPages: number }> {
//   const { carBrand, startYear, endYear, minPrice, maxPrice, search, page = 1, limit = 5 } = filterDto;

//   if (!carBrand) throw new UnauthorizedException('Please Enter Correct Car Brand....');
//   if (carBrand === 'string' || carBrand === '') throw new UnauthorizedException('Please Enter Car Brand...!');
//   if (minPrice && maxPrice === 0 || null) throw new UnauthorizedException('Please Enter Min & Max Price Of Car...!');

//   let car: any = {
//     carBrand,
//     manufacturing_year: Between(startYear, endYear),
//     price: Between(minPrice, maxPrice),
//   };

//   if (search) {
//     car = [
//       { ...car, carModel: Like(`%${search}%`) },
//       { ...car, color: Like(`%${search}%`) },
//     ];
//   }

//   const [cars, totalCars] = await this.carRepository.findAndCount({
//     where: car,
//     skip: (page - 1) * limit,
//     take: limit,
//   });

//   if (cars.length === 0) {
//     throw new NotFoundException(`No cars found matching the criteria`);
//   }

//   const totalPages = Math.ceil(totalCars / limit);

//   return { cars, totalCars, totalPages };
// }


// private isValidColumn(column: string): boolean {
//   const validColumns = ['id', 'carBrand', 'manufacturing_year', 'price'];
//   return validColumns.includes(column);
// }

//   async findByBrand(carBrand: string): Promise<Car> {
//   async findByBrand(carBrand: string): Promise<Car> {
//     return this.carRepository.findOne({ where: { carBrand } });
//   }
// }

// private formatCarDate(car: Car, transaction: CarTransaction): FormattedCar {
//   return {
//     ...car,
//     buyDate: transaction.transactionDateTime ? moment(transaction.transactionDateTime).format('DD-MM-YYYY') : null,
//     sellDate: transaction.transactionDateTime ? moment(transaction.transactionDateTime).format('DD-MM-YYYY') : null,
//   };
// }

// async getUserPurchaseHistory(userId: string): Promise<CarTransaction[]> {
//   return this.transactionRepository.find({
//     where: { buyerId: userId, transactionType: 'buy' },
//     relations: ['car'],
//     order: { transactionDateTime: 'DESC' },
//   });
// }

// async getUserSaleHistory(userId: string): Promise<CarTransaction[]> {
//   return this.transactionRepository.find({
//     where: { sellerId: userId, transactionType: 'sell' },
//     relations: ['car'],
//     order: { transactionDateTime: 'DESC' },
//   });
// }

// async getCarsSoldByDealer(dealerId: string): Promise<CarTransaction[]> {
//   const cars = await this.transactionRepository.find({
//     where: {
//       sellerId: dealerId,
//       sellerType: 'dealer',
//       buyerType: 'user',
//     },
//     relations: ['car']
//   });
//   return cars;
// }

// async findByYearRange(startYear: number, endYear: number): Promise<Car[]> {
//   return this.carRepository.find({
//     where: {
//       manufacturing_year: Between(startYear, endYear),
//     },
//   });
// }

// async findByPriceRange(minPrice: number, maxPrice: number): Promise<Car[]> {
//   return this.carRepository.find({
//     where: {
//       price: Between(minPrice, maxPrice),
//     },
//   });
// }

// async getDealerId(): Promise<string> {
//   const dealerCar = await this.carRepository.findOne({
//     where: {
//       currentOwnerType: 'dealer',
//       dealerName: 'KP Group'  // Assuming this is the main dealer
//     }
//   });

//   if (!dealerCar) {
//     throw new NotFoundException('Main dealer not found in the system');
//   }

//   return dealerCar.currentOwnerId, dealerCar.currentOwnerType;
// }

// async getUserTotalExpense(userId: string): Promise<number> {
//   const result = await this.transactionRepository
//     .createQueryBuilder('transaction')
//     .select('SUM(transaction.price)', 'totalExpense')
//     .where('transaction.buyerId = :userId', { userId })
//     .andWhere('transaction.transactionType = :type', { type: 'buy' })
//     .getRawOne();

//   return result.totalExpense || 0;
// }

// async findBrandPriceYear(carBrand: string, price: number, manufacturing_year: number): Promise<Car[]> {
//   const car = await this.carRepository.find({ where: { carBrand, price, manufacturing_year } })
//   if (!car) {
//     throw new UnauthorizedException(`Car With ${carBrand} & ${price} & ${manufacturing_year} not found`)
//   }
//   return car;
//

// async filterCars1(filterDto: FilterCarDto): Promise<{ cars: Car[], totalCars: number, totalPages: number }> {
//   const { carBrand, startYear, endYear, minPrice, maxPrice, page = 1, limit = 5 } = filterDto;

//   let query = this.carRepository.createQueryBuilder('car');

//   if (carBrand) {
//     query = query.andWhere('car.carBrand = :carBrand', { carBrand });
//   }

//   if (startYear && endYear) {
//     query = query.andWhere('car.manufacturing_year BETWEEN :startYear AND :endYear', { startYear, endYear });
//   }

//   if (minPrice && maxPrice) {
//     query = query.andWhere('car.price BETWEEN :minPrice AND :maxPrice', { minPrice, maxPrice });
//   }

//   // if (search) {
//   //   query = query.andWhere('(car.carBrand LIKE :search OR car.carModel LIKE :search OR car.color LIKE :search)', { search: `%${search}%` });
//   // }

//   const totalCars = await query.getCount();
//   const totalPages = Math.ceil(totalCars / limit);

//   const cars = await query
//     .skip((page - 1) * limit)
//     .take(limit)
//     .getMany();

//   if (cars.length === 0) {
//     throw new NotFoundException('No cars found matching the criteria');
//   }

//   return { cars, totalCars, totalPages };
// }

// async filterCars1(filterDto: FilterCarDto): Promise<{ cars: Car[], totalCars: number, totalPages: number }> {
//   const { carBrand, startYear, endYear, minPrice, maxPrice, page = 1, limit = 5 } = filterDto;

//   if (carBrand === 'string' || carBrand === '') {
//     throw new UnauthorizedException('Please Enter Car Brand...!');
//   }

//   const whereClause: any = {};

//   if (carBrand) {
//     whereClause.carBrand = carBrand;
//   }
//   else if(carBrand === 'string' || carBrand === ''){
//     throw new UnauthorizedException('Please Enter Car Brand...!')
//   }

//   if (startYear && endYear) {
//     whereClause.manufacturing_year = Between(startYear, endYear);
//   }

//   if (minPrice && maxPrice) {
//     whereClause.price = Between(minPrice, maxPrice);
//   }

//   // if (search) {
//   //   whereClause.carModel = Like(`%${search}%`);
//   // }

//   const [cars, totalCars] = await this.carRepository.findAndCount({
//     where: whereClause,
//     skip: (page - 1) * limit,
//     take: limit,
//   });

//   if (cars.length === 0) {
//     throw new NotFoundException(`No cars found matching the criteria`);
//   }

//   const totalPages = Math.ceil(totalCars / limit);

//   return { cars, totalCars, totalPages };
// }

// async getCarOwner(carId: string): Promise<string> {
//   const car = await this.carRepository.findOne({ where: { id: carId } });
//   if (!car) {
//     throw new NotFoundException('Car not found');
//   }
//   return car.currentOwnerId;
// }
