/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Body, Param, Request, UseInterceptors, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UserDto } from './dto/user.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verifyotp.dto';
import { ChangePwdDto } from './dto/changepwd.dto';
import { ForgotPwdDto } from './dto/forgotpwd.dto';
import { ResetPwdDto } from './dto/resetpwd.dto';
import { UpdateUserDto } from './dto/updateuser.dto';
import { ValidationInterceptor } from './interceptor/validation.interceptor';
import { ClientProxy, MessagePattern, Payload } from '@nestjs/microservices';
import { User, UserRole, UserStatus } from './user.entity';

@ApiTags('users')
@Controller('users')
export class UserController {
  private readonly client: ClientProxy;
  constructor(private userService: UserService) { }

  @UseInterceptors(ValidationInterceptor)
  @ApiBearerAuth()
  @Post('Update/:email')
  @ApiOperation({ summary: 'Update user information by email' })
  async updateUser(
    @Param('email') email: string,
    @Request() req,
    @Body() updateUserDto: UpdateUserDto
  ) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.userService.updateUser(email, updateUserDto, token);
  }

  @Post('Register')
  @ApiOperation({ summary: 'Create a new user' })
  async register(@Body() userDto: UserDto) {
    await this.userService.save(userDto);
    return { message: 'User Registered Successfully...!' };
  }

  @Post('login')
  async login(
    @Body() { email, password }: LoginDto,
  ): Promise<{ message: string; role: UserRole; status: UserStatus }> {
    try {
      const { message, role, status } = await this.userService.login(
        email,
        password,
      );
      return { message, role, status };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        if (error.message === 'User blocked') {
          return {
            message:
              'Your account has been blocked due to too many failed login attempts. Please contact the admin!',
            role: null,
            status: null,
          };
        }
        return {
          message: error.message,
          role: null,
          status: null,
        };
      }
      throw error;
    }
  }

  @UseInterceptors(ValidationInterceptor)
  @ApiBearerAuth()
  @Post('Verify-OTP')
  async verifyotp(@Request() req, @Body() { otp }: VerifyOtpDto) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.userService.verifyotp(otp, token);
  }

  // @UseInterceptors(ValidationInterceptor)
  @ApiBearerAuth()
  @Post('Resend-OTP')
  async resendotp(@Request() req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.userService.resendotp(token);
  }

  @UseInterceptors(ValidationInterceptor)
  @ApiBearerAuth()
  @Post('Change-Password')
  async changepwd(
    @Request() req,
    @Body() { email, oldpwd, newpwd }: ChangePwdDto,
  ) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.userService.changePwd(email, oldpwd, newpwd, token);
  }

  @Post('Forgot-Password')
  async forgotpwd(@Body() { email }: ForgotPwdDto) {
    return this.userService.forgotpwd(email);
  }

  @UseInterceptors(ValidationInterceptor)
  @ApiBearerAuth()
  @Post('Reset-Password')
  async resetpwd(@Request() req, @Body() { newpwd }: ResetPwdDto) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.userService.resetpwd(newpwd, token)
  }

  @MessagePattern({ cmd: 'user_info' })
  async getUserInfo(@Payload() data: { email: string }) {
    try {
      const user = await this.userService.findOne(data.email);

      if (!user) {
        console.log('User not found for email:', data.email);
        return { error: 'User not found' };
      }

      console.log('Found user');

      return {
        userId: user.id,
        email: user.email,
        firstname: user.firstname,
        // Include other fields as needed
      };
    } catch (error) {
      console.error('Error fetching user info:', error);
      return { error: 'Internal server error' };
    }
  }
}

  // @MessagePattern({ cmd: 'token_info' })
  // async getTokenInfo(@Payload() data: { token: string }) {
  //   const user = await this.userService.findOne(data.token)
  //   if (!user) {
  //     console.log('User not found for token:', data.token);
  //     return { error: 'User not found' };
  //   }

  //   console.log('Found user');
  // }

  // @Get()
  // @ApiOperation({ summary: 'Get all users' })
  // findAll() {
  //   return this.userService.findAll();
  // }

  // @Get(':email')
  // @ApiOperation({ summary: 'Get user and cars by email' })
  // findByEmail(@Param('email') email: string) {
  //   return this.userService.findByEmail(email);
  // }