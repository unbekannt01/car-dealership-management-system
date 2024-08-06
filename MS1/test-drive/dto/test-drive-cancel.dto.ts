/* eslint-disable prettier/prettier */
import { ApiProperty } from "@nestjs/swagger";

export class CancelTestDriveDto {
    @ApiProperty()
    reason: string;
}