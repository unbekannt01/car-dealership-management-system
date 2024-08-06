/* eslint-disable prettier/prettier */
import { ApiProperty } from "@nestjs/swagger";
import { Entity } from "typeorm";

Entity()
export class UpdateUserDto {
    
    @ApiProperty()
    firstname?: string;
  
    @ApiProperty()
    lastname?: string;
  
    @ApiProperty()
    username?: string;

    @ApiProperty()
    mobile_no?: string;
  
    @ApiProperty()
    country?: string;
  
    @ApiProperty()
    dateOfBirth?: Date;
  
    @ApiProperty()
    email?: string;
}