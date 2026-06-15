import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ERROR_CODES, type ApiErrorBody } from '@repo/shared';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';

function defaultErrorCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ERROR_CODES.VALIDATION_ERROR;
    case HttpStatus.UNAUTHORIZED:
      return ERROR_CODES.AUTH_UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ERROR_CODES.RATE_LIMITED;
    default:
      return status >= 500 ? ERROR_CODES.INTERNAL_ERROR : `HTTP_${status}`;
  }
}

/** Format mọi lỗi về `{ statusCode, message, errorCode, details? }`. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // Gateway (ws) tự xử lý lỗi của nó
    if (host.getType() !== 'http') throw exception;

    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${body.statusCode} ${body.message}`,
        stack,
      );
    }

    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof ZodValidationException) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Dữ liệu không hợp lệ',
        errorCode: ERROR_CODES.VALIDATION_ERROR,
        // getZodError() trả unknown vì nestjs-zod hỗ trợ cả zod v3/v4 — repo này chỉ dùng v4
        details: (exception.getZodError() as ZodError).issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
        errorCode: ERROR_CODES.RATE_LIMITED,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      // AppException đã có sẵn body chuẩn
      if (
        typeof response === 'object' &&
        response !== null &&
        'errorCode' in response
      ) {
        return response as ApiErrorBody;
      }

      const raw =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ??
            exception.message);

      return {
        statusCode: status,
        message: Array.isArray(raw) ? raw.join('; ') : raw,
        errorCode: defaultErrorCode(status),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Lỗi hệ thống, vui lòng thử lại sau',
      errorCode: ERROR_CODES.INTERNAL_ERROR,
    };
  }
}
