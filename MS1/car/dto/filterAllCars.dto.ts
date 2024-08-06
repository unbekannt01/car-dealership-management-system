/* eslint-disable prettier/prettier */
import { Type } from "@nestjs/class-transformer";
import { IsIn, IsNumber, IsString, Min } from "@nestjs/class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class FilterAllCarsDto {

    @ApiProperty()
    @IsString()
    carBrands?: string;

    @ApiProperty()
    @IsNumber()
    startYear?: number;

    @ApiProperty()
    @IsNumber()
    endYear?: number;

    @ApiProperty()
    @IsNumber()
    @Min(0)
    minPrice?: number = 0;

    @ApiProperty()
    @IsNumber()
    @Min(0)
    maxPrice?: number = Number.MAX_SAFE_INTEGER;

    @ApiProperty()
    @IsString()
    search?: string = "";

    @ApiProperty()
    @IsNumber()
    @Type(() => Number)
    pageLimit?: number = 10;

    @ApiProperty({default:'1'})
    @IsNumber()
    @Type(() => Number)
    pageNumber?: number = 1;

    @ApiProperty({default:'ASC'})
    @IsIn(['ASC', 'DESC'])
    orderBy?: 'ASC' | 'DESC' = 'ASC';

    @ApiProperty({default:'carModel'})
    @IsString()
    sortBy?: string = 'carModel';
} 
