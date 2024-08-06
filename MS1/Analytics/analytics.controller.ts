/* eslint-disable prettier/prettier */
// import { Controller, Get, Body } from '@nestjs/common';
// import { AnalyticsService } from './analytics.service';

// @Controller('analytics')
// // @UseGuards(JwtAuthGuard, RolesGuard)
// export class AnalyticsController {
//   constructor(private readonly analyticsService: AnalyticsService) {}

//   // @Get()
//   // async getAnalytics(
//   //   @Headers('authorization') authHeader: string,
//   //   @Query('startDate') startDate?: Date,
//   //   @Query('endDate') endDate?: Date
//   // ) {
//   //   if (!authHeader) {
//   //     throw new UnauthorizedException('No token provided');
//   //   }

//   //   const token = authHeader.split(' ')[1];  // Assuming 'Bearer TOKEN' format

//   //   const start = startDate ? new Date(startDate) : undefined;
//   //   const end = endDate ? new Date(endDate) : undefined;

//   //   return this.analyticsService.getAnalytics(token, start, end);
//   // }

//   @Get()
//   async getAnalytics1(
//     @Body() startDate : Date, @Body() endDate:Date
//   ){
//     return this.analyticsService.getAllUsersAnalytics(startDate,endDate)
//   }

// //   @Get('user')
// // //   @Roles('user')
// //   async getUserAnalytics(
// //     @Headers('authorization') authHeader: string,
// //     @Query('startDate') startDate?: string,
// //     @Query('endDate') endDate?: string
// //   ) {
// //     if (!authHeader) {
// //       throw new UnauthorizedException('No token provided');
// //     }

// //     const token = authHeader.split(' ')[1];

// //     const start = startDate ? new Date(startDate) : undefined;
// //     const end = endDate ? new Date(endDate) : undefined;

// //     return this.analyticsService.getAnalytics(token, start, end);
// //   }

// //   @Get('dealer')
// // //   @Roles('admin')
// //   async getDealerAnalytics(
// //     @Headers('authorization') authHeader: string,
// //     @Query('startDate') startDate?: string,
// //     @Query('endDate') endDate?: string
// //   ) {
// //     if (!authHeader) {
// //       throw new UnauthorizedException('No token provided');
// //     }

// //     const token = authHeader.split(' ')[1];

// //     const start = startDate ? new Date(startDate) : undefined;
// //     const end = endDate ? new Date(endDate) : undefined;

// //     return this.analyticsService.getAnalytics(token, start, end);
// //   }
// }
