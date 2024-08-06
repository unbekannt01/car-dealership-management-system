/* eslint-disable prettier/prettier */
import { ApiProperty } from "@nestjs/swagger";
import { Entity } from "typeorm";

Entity()
export class ChangePwdDto{

    @ApiProperty()
    email:string;

    @ApiProperty()
    oldpwd :string;

    @ApiProperty()
    newpwd :string;
}