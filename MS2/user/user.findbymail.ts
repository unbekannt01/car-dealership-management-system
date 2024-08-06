/* eslint-disable prettier/prettier */
import { ApiProperty } from "@nestjs/swagger";

export class FindUserByEmailDto{

    @ApiProperty()
    email : string;
}