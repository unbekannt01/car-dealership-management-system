/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  Request,
  Patch,
  Query,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { CarService } from './car.service';
import { CreateCarDto } from './dto/car.dto';
import { Car } from './car.entity';
import { UpdateCarDto } from './dto/updatecar.dto';
// import { FilterAllCarsDto } from './dto/filterAllCars.dto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { FilterAllCarsDto } from './dto/filterAllCars.dto';

@ApiTags('cars')
@Controller('cars')
export class CarController {
  constructor(
    @InjectRepository(Car)
    private readonly carRepository: Repository<Car>,
    private carService: CarService,
  ) { }

  @ApiBearerAuth()
  @Post('create-new-car')
  async createCar(@Request() req, @Body() carDto: CreateCarDto) {
    const token = req.headers.authorization?.replace('Bearer ', '').trim();
    await this.carService.create(carDto, token);
    return { message: 'You have Registered your car...!' };
  }

  // @Post()
  // @ApiOperation({ summary: 'Get all cars' })
  // async findAllWithPagination(@Body() filterAllCars: FilterAllCarsDto) {
  //   const { cars, totalCars, totalPages } = await this.carService.findAllWithPagination(filterAllCars);
  //   return {
  //     data: cars,
  //     totalCars: totalCars,
  //     totalPages: totalPages,
  //     message: 'Cars fetched Successfully...!'
  //   }
  // }

  @Get('all-cars')
  async findAll(): Promise<Car[]> {
    return this.carService.findAll();
  }

  @ApiOperation({ summary: 'Update a car' })
  @Post('id')
  async update(
    @Param('id') id: string,
    @Body() updateCarDto: UpdateCarDto,
  ): Promise<Car> {
    return this.carService.update(id, updateCarDto);
  }

  @ApiOperation({ summary: 'Delete a car' })
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Car> {
    return this.carService.delete(id);
  }

  @Patch('buy/:carId')
  @ApiBearerAuth()
  async buyCar(@Param('carId') carId: string, @Request() req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const result = await this.carService.buyCar(carId, token);

    return {
      message: 'Car purchased successfully',
      transactionDetails: {
        carId: result.transaction.id,
        carBrand: result.transaction.car.carBrand,
        carModel: result.transaction.car.carModel,
        color: result.transaction.car.color,
        price: result.transaction.price,
        sellerId: result.transaction.sellerId,
        buyerId: result.transaction.buyerId,
        transactionDateTime: result.transaction.transactionDateTime,
      },
      updatedCarDetails: {
        carId: result.updatedCar.id,
        currentOwnerId: result.updatedCar.currentOwnerId,
        currentOwnerType: result.updatedCar.currentOwnerType,
        status: result.updatedCar.status,
        availableForTestDrive: result.updatedCar.availableForTestDrive,
      },
    };
  }

  @Patch('sell/:carId')
  @ApiBearerAuth()
  async sellCar(@Param('carId') carId: string, @Request() req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const result = await this.carService.sellCar(carId, token);

    if (!result) {
      throw new NotFoundException('Car not found');
    }
    return {
      message: 'Car sold successfully',
      transactionDetails: {
        transactionId: result.transaction.id,
        carId: result.transaction.car.id,
        carBrand: result.transaction.car.carBrand,
        carModel: result.transaction.car.carModel,
        color: result.transaction.car.color,
        price: result.transaction.price,
        sellerId: result.transaction.sellerId,
        buyerId: result.transaction.buyerId,
        transactionDateTime: result.transaction.transactionDateTime,
      },
      updatedCarDetails: {
        carId: result.updatedCar.id,
        currentOwnerId: result.updatedCar.currentOwnerId,
        currentOwnerType: result.updatedCar.currentOwnerType,
        status: result.updatedCar.status,
        availableForTestDrive: result.updatedCar.availableForTestDrive,
      },
    };
  }

  @ApiBearerAuth()
  @Get('available-for-sale-and-test-drive')
  async getAvailableCarsForSaleAndTestDrive(@Request() req,) {
    const token = req.headers.authorization?.replace('Bearer ', '').trim();
    const { cars, totalCars } = await this.carService.getAvailableCarsForSaleAndTestDrive(token);
    return {
      // totalPages : totalPages,
      totalCars: totalCars,
      data: cars,
      message: 'Cars fetched successfully'
    }
  }

  @Get('user-report/:userId')
  @ApiOperation({ summary: 'Get user car transaction and test drive report' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'User report retrieved successfully',
  })
  async getUserReport(
    @Param('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.carService.getUserReport(userId, start, end);
  }

  @Get('dealer-report/:dealerId')
  @ApiOperation({ summary: 'Get dealer car transaction and test drive report' })
  @ApiParam({ name: 'dealerId', description: 'Dealer ID' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Dealer report retrieved successfully',
  })
  async getDealerReport(
    @Param('dealerId') dealerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.carService.getDealerReport(dealerId, start, end);
  }

  @Post('filter')
  async filterCars(@Body() filterDto: FilterAllCarsDto) {
    return this.carService.filterCars(filterDto);
  }

  // @Get('analytics')
  // async getAnalytics1(
  //   @Query('startDate') startDate : Date, @Query('endDate') endDate:Date
  // ){
  //   return this.carService.getAllUsersAnalytics(startDate,endDate)
  // }
}

// @Get('dealer-sales-report')
// async getDealerSaleReport(@Param('userId') dealerId: string) {
//   return this.carService.getCarsSoldByDealer(dealerId);
// }

// @Get('sold-by-user/:userId')
// @ApiOperation({ summary: 'Get cars sold by user' })
// @ApiParam({ name: 'userId', description: 'User ID' })
// async getCarsSoldByUser(
//   @Param('userId') userId: string,
// ) {
//   return this.carService.getUserSaleHistory(userId);
// }

// @Get('bought-by-user/:userId')
// @ApiOperation({ summary: 'Get cars bought by user' })
// @ApiParam({ name: 'userId', description: 'User ID' })
// async getCarsBoughtByUser(
//   @Param('userId') userId: string,
// ) {
//   return this.carService.getUserPurchaseHistory(userId);
// }

// @Get('sold-by-dealer/:dealerId')
// @ApiOperation({ summary: 'Get cars sold by dealer' })
// // @ApiParam({ name: 'dealerId', description: 'Dealer ID' })
// async getCarsSoldByDealer(
//   @Param('userId') userId: string,
//   // @Request() req,
// ) {
//   // const  = req.headers.authorization?.replace('Bearer', '')
//   return this.carService.getCarsSoldByDealer(userId);
// }

// @Post('Filter')
// async findAll1(@Body() { carBrand , startYear, endYear , minPrice , maxPrice } : FilterDto) :Promise<Car[]>{
//   return this.carService.filterByModelByYearByPrice(carBrand,startYear,endYear, minPrice,maxPrice)
// }