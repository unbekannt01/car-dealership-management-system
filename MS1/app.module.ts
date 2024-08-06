/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarModule } from './car/car.module';
import { TestDriveModule } from './test-drive/test-drive.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
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
      }
    ]),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '',
      database: 'ms1',
      autoLoadEntities: true,
      synchronize: true,
    }),
    TestDriveModule,
    CarModule,
  ],
})

export class AppModule { }

// {
//   name: 'USER_SERVICE',
//   transport: Transport.RMQ,
//   options: {
//     urls: ['amqp://localhost:5672'],
//     queue: 'user_queue',
//     queueOptions: { durable: false },
//   },
// },