/* eslint-disable prettier/prettier */
// import { Injectable, UnauthorizedException } from "@nestjs/common";
// import { JwtService } from "@nestjs/jwt";
// import { InjectRepository } from "@nestjs/typeorm";
// // import moment from "moment";
// import { Car } from "src/car/car.entity";
// import { CarTransaction } from "src/car/carTransaction.entity";
// import { TestDrive } from "src/test-drive/entities/test-drive.entity";
// import { Between, Not, Repository } from "typeorm";

// @Injectable()
// export class AnalyticsService {
//   constructor(
//     @InjectRepository(Car)
//     private readonly carRepository: Repository<Car>,
//     @InjectRepository(CarTransaction)
//     private readonly transactionRepository: Repository<CarTransaction>,
//     @InjectRepository(TestDrive)
//     private readonly testDriveRepository: Repository<TestDrive>,
//     private readonly jwtService: JwtService
//   ) {}

//   async getAnalytics(token: string, startDate?: Date, endDate?: Date): Promise<any> {
//     if (!token) throw new UnauthorizedException('Invalid Token');

//     const decoded = this.jwtService.verify(token, { secret: 'hello buddy !' });
//     const userId = decoded.id;
//     const role = decoded.role;

//     const currentDate = new Date();
//     startDate = startDate || new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
//     endDate = endDate || currentDate;

//     if (role === 'admin') {
//       return this.getDealerAnalytics(userId, startDate, endDate);
//     } else {
//       return this.getUserAnalytics(userId, startDate, endDate);
//     }
//   }

//   private async getUserAnalytics(userId: string, startDate: Date, endDate: Date): Promise<any> {
//     const transactions = await this.transactionRepository.find({
//       where: [
//         { buyerId: userId, transactionDateTime: Between(startDate, endDate) },
//         { sellerId: userId, transactionDateTime: Between(startDate, endDate) }
//       ],
//       relations: ['car']
//     });

//     const testDrives = await this.testDriveRepository.find({
//       where: { userId: userId, scheduledDate: Between(startDate, endDate) }
//     });

//     const currentCars = await this.carRepository.find({
//       where: { currentOwnerId: userId }
//     });

//     const boughtCars = transactions.filter(t => t.buyerId === userId);
//     const soldCars = transactions.filter(t => t.sellerId === userId);

//     return {
//       transactions: transactions.map(t => ({
//         type: t.buyerId === userId ? 'buy' : 'sell',
//         carBrand: t.car.carBrand,
//         carModel: t.car.carModel,
//         price: t.price,
//         date: t.transactionDateTime
//       })),
//       testDrives: testDrives.map(td => ({
//         carBrand: td.carBrand,
//         carModel: td.carModel,
//         scheduledDate: new Date(td.scheduledDate), // Ensure this is a Date object
//         status: td.status
//       })),
//       currentCars: currentCars.map(c => ({
//         brand: c.carBrand,
//         model: c.carModel,
//         year: c.manufacturing_year
//       })),
//       summary: {
//         totalBought: boughtCars.length,
//         totalSold: soldCars.length,
//         totalSpent: boughtCars.reduce((sum, t) => sum + t.price, 0),
//         totalEarned: soldCars.reduce((sum, t) => sum + t.price, 0),
//         testDrivesScheduled: testDrives.length,
//         currentCarsCount: currentCars.length
//       }
//     };
//   }

//   private async getDealerAnalytics(dealerId: string, startDate: Date, endDate: Date): Promise<any> {
//     const transactions = await this.transactionRepository.find({
//       where: [
//         { buyerId: dealerId, transactionDateTime: Between(startDate, endDate) },
//         { sellerId: dealerId, transactionDateTime: Between(startDate, endDate) }
//       ],
//       relations: ['car']
//     });

//     const testDrives = await this.testDriveRepository.find({
//       where: { dealerName: 'KP Group', scheduledDate: Between(startDate, endDate) }
//     });

//     const inventory = await this.carRepository.find({
//       where: { currentOwnerId: dealerId, currentOwnerType: 'dealer' }
//     });

//     const soldCars = transactions.filter(t => t.sellerId === dealerId);
//     const boughtCars = transactions.filter(t => t.buyerId === dealerId);

//     return {
//       transactions: transactions.map(t => ({
//         type: t.buyerId === dealerId ? 'buy' : 'sell',
//         carBrand: t.car.carBrand,
//         carModel: t.car.carModel,
//         price: t.price,
//         date: t.transactionDateTime
//       })),
//       testDrives: testDrives.map(td => ({
//         carBrand: td.carBrand,
//         carModel: td.carModel,
//         scheduledDate: new Date(td.scheduledDate), // Ensure this is a Date object
//         status: td.status
//       })),
//       inventory: inventory.map(c => ({
//         brand: c.carBrand,
//         model: c.carModel,
//         year: c.manufacturing_year,
//         price: c.price
//       })),
//       summary: {
//         totalSold: soldCars.length,
//         totalBought: boughtCars.length,
//         totalRevenue: soldCars.reduce((sum, t) => sum + t.price, 0),
//         totalExpense: boughtCars.reduce((sum, t) => sum + t.price, 0),
//         testDrivesScheduled: testDrives.length,
//         currentInventory: inventory.length
//       },
//       userAnalytics: await this.getAllUsersAnalytics(startDate, endDate)
//     };
//   }

//   private async getAllUsersAnalytics(startDate: Date, endDate: Date): Promise<any> {
//     const userTransactions = await this.transactionRepository.find({
//       where: {
//         transactionDateTime: Between(startDate, endDate),
//         buyerType: 'user'
//       },
//       relations: ['car']
//     });

//     const userTestDrives = await this.testDriveRepository.find({
//       where: {
//         scheduledDate: Between(startDate, endDate),
//         status: Not('Cancelled')
//       }
//     });

//     return {
//       totalUserPurchases: userTransactions.length,
//       totalRevenue: userTransactions.reduce((sum, t) => sum + t.price, 0),
//       averagePurchasePrice: userTransactions.length > 0 ? userTransactions.reduce((sum, t) => sum + t.price, 0) / userTransactions.length : 0,
//       totalTestDrives: userTestDrives.length
//     };
//   }
// }
