/* eslint-disable prettier/prettier */
// testdrive.controller.ts
import { Controller, Post, Body, Param, Patch, Delete, Get, Request } from '@nestjs/common';
import { TestDriveService } from './test-drive.service';
import { CreateTestDriveDto } from './dto/test-drive.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TestDrive } from './entities/test-drive.entity';
import { TestDriveRescheduleDto } from './dto/test-drive-reschedule.dto';
import { CancelTestDriveDto } from './dto/test-drive-cancel.dto';

@ApiTags('test-drives')
@Controller('test-drives')
export class TestDriveController {
  constructor(private readonly testDriveService: TestDriveService) { }

  @ApiBearerAuth()
  @Post('create-test-drive')
  async create(@Request() req, @Body() createTestDriveDto: CreateTestDriveDto) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.testDriveService.createTestDrive(createTestDriveDto, token);
  }

  @ApiBearerAuth()
  @Patch(':id/reschedule')
  reschedule(
    @Request() req,
    @Param('id') id: string,
    @Body() testDriveRescheduleDto: TestDriveRescheduleDto
  ) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.testDriveService.rescheduleTestDrive(id, testDriveRescheduleDto, token);
  }

  @ApiBearerAuth()
  @Delete(':id/cancel')
  async cancelTestDrive(
    @Param('id') id: string,
    @Body() cancelTestDriveDto: CancelTestDriveDto,
    @Request() req,
  ) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.testDriveService.cancelTestDrive(id, token, cancelTestDriveDto.reason);
  }

  @ApiBearerAuth()
  @Patch(':id/confirm-test-drive-by-dealer')
  confirmTestDrive(@Param('id') id: string, @Request() req) {
    const token = req.headers.authorization?.replace('Bearer ', '')
    return this.testDriveService.confirmTestDrive(id, token);
  }

  @Get('Get-Pending-Test-Drives')
  async getPendingTestDrives(): Promise<TestDrive[]> {
    return this.testDriveService.getPendingTestDrives();
  }

  @Get('Get-all-test-drives')
  async getAllTestDrive(): Promise<any[]> {
    return this.testDriveService.getAllTestDrives();
  }

  @Get('by-user/:userId')
  @ApiOperation({ summary: 'Get test drives by user' })
  async getTestDrivesByUser(
    @Param('userId') userId: string,
    @Body() startDate?: string,  @Body() endDate?: string
  ) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    return this.testDriveService.getTestDrivesByUser(userId, start, end);
  }
}
