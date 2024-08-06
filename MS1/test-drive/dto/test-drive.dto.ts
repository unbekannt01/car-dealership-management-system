/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsDateString, Matches, MinDate } from '@nestjs/class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTestDriveDto {

  @ApiProperty()
  @IsNotEmpty()
  carBrand: string;

  @ApiProperty()
  @IsNotEmpty()
  carModel: string;

  @ApiProperty({ example: '2024-07-13' })
  @IsNotEmpty()
  @IsDateString()
  @MinDate(new Date(), { message: 'Scheduled date must be in the future' })
  scheduledDate: string;

  @ApiProperty({ example: '12:30' })
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Invalid time format. Use HH:MM (24-hour format)',
  })
  scheduledTime: string;

  @ApiProperty({ default: 'KP Group' })
  dealerName: string;
}