/* eslint-disable prettier/prettier */
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest();
    if (request.url.startsWith('/cars')) {
      return next.handle(); // Skip validation for car routes
    }
    return next.handle().pipe(
      tap(() => {
        Logger.log(
          `${request.method} ${request.url} ${Date.now() - now}ms`,
          context.getClass().name,
        );
      }),
    );
  }
}
