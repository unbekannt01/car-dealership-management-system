/* eslint-disable prettier/prettier */
import { ApiProperty } from "@nestjs/swagger";
import { Entity } from "typeorm";

@Entity()
export class VerifyOtpDto{

    @ApiProperty()
    otp:string;
}
