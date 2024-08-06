/* eslint-disable prettier/prettier */
import {
  CallHandler,
  NestInterceptor,
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as jwt from 'jsonwebtoken';

interface JwtPayload {
  exp: number;
  [key: string]: any;
}

@Injectable()
export class ValidationInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();

    // Token validation
    const token = request.headers.authorization?.split(' ')[1]; // Assuming Bearer token
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      // Verify and decode the token
      const decoded = jwt.verify(token, 'hello buddy !') as JwtPayload;

      // Check if token is expired
      if (decoded.exp < Date.now() / 1000) {
        throw new UnauthorizedException('Token has expired');
      }

      // You can also add the decoded user info to the request for use in controllers
      request.user = decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }

    return next
      .handle()
      .pipe(tap(() => console.log('Request processed successfully')));
  }
}