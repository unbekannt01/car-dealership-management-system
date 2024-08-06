/* eslint-disable prettier/prettier */
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestDriveService } from './test-drive.service';
import { TestDriveController } from './test-drive.controller';
import { TestDrive } from './entities/test-drive.entity';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CarModule } from 'src/car/car.module';
import { JwtService } from '@nestjs/jwt';

@Module({
    imports: [
        TypeOrmModule.forFeature([TestDrive]),
        forwardRef(() => CarModule),
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
    controllers: [TestDriveController],
    providers: [TestDriveService, JwtService,
       TestDrive
    ],
    exports: [TestDriveService,TypeOrmModule]
})
export class TestDriveModule {}
