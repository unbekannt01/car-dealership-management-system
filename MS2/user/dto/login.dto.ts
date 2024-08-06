/* eslint-disable prettier/prettier */
import { Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class LoginDto {

  @ApiProperty()
  email: string;  
  
  @ApiProperty()
  password: string;
}