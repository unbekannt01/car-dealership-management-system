/* eslint-disable prettier/prettier */
import { IsOptional, IsNumber, IsString } from '@nestjs/class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class  UpdateCarDto {

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carBrand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  manufacturing_year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  details?: string;
}