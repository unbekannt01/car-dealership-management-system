/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsNumber, IsString, IsOptional } from '@nestjs/class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCarDto {

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  carBrand: string;
  
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  carModel: string;
  
  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  manufacturing_year: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  details?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color: string;

}

// @ApiProperty()
// @IsNotEmpty()
// @IsEnum(['user', 'dealer'])
// currentOwnerType: 'user' | 'dealer';

// @ApiProperty()
// @IsNotEmpty()
// @IsEnum(['for_sale', 'sold'])
// status: 'for_sale' | 'sold';

// @Column({ default:'KP Group' })
// dealerName: string;