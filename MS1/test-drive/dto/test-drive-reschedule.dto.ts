/* eslint-disable prettier/prettier */
import { ApiProperty } from "@nestjs/swagger";

export class TestDriveRescheduleDto {
  @ApiProperty()
  // @IsDateString()
  newDate: string;

  @ApiProperty()
  // @IsString()
  // @Matches(/^([0-1]\d|2[0-3]):([0-5]\d)$/, { message: 'newStartTime must be in the format HH:mm' })
  newTime: string;
}
