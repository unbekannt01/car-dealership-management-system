/* eslint-disable prettier/prettier */
import { Type } from "@nestjs/class-transformer";
import { IsNumber, IsOptional } from "@nestjs/class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class FilterCarDto {
  
    @ApiProperty()
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    page?: number = 1;
  
    @ApiProperty()
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number = 10;
    
  }

  