/* eslint-disable prettier/prettier */
import { PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../user.entity';
import { IsEmail, IsNotEmpty, Matches, MinLength } from 'class-validator';

export class UserDto {
  @PrimaryGeneratedColumn()
  userId: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'First name is required' })
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  firstname: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Last name is required' })
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  lastname: string;

  @ApiProperty()
  gender: string;

  @ApiProperty()
  @IsEmail()
  @IsNotEmpty({ message: 'Email is required' })
  @Matches(/^[a-zA-Z0-9.]+@[a-zA-Z0-9.]+\.[a-zA-Z]{2,}$/, {
    message: 'Invalid email format',
  })
  email: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Username is Required...!' })
  username: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Password is Required...!' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[\W_]).{8,}$/, {
    message: 'Password must include 1 uppercase, 1 lowercase, 1 number, and 1 special character',
  })
  password: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Mobile number is Required...!' })
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Invalid mobile number format',
  })
  mobile_no: string;
  
  @ApiProperty()
  country: string;

  @ApiProperty({default:'yyyy-mm-dd', nullable:true})
  dateOfBirth: string;

  @ApiProperty({ default: UserRole.USER })
  role: UserRole;
}