/* eslint-disable prettier/prettier */
import { Module, forwardRef } from '@nestjs/common';
import { CarController } from './car.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Car } from './car.entity';
import { CarService } from './car.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { TestDriveModule } from '../test-drive/test-drive.module';
import { CarTransaction } from './carTransaction.entity';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Car, CarTransaction]),
    forwardRef(() => TestDriveModule),
    ClientsModule.register([
      {
        name: 'CAR_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'car_queue',
          queueOptions: {
            durable: false,
          },
        },
      },
    ]),
  ],
  providers: [  
    CarService,
    Car,
    JwtService,
    CarTransaction
  ],
  controllers: [CarController],
  exports: [CarService]
})
export class CarModule {}
