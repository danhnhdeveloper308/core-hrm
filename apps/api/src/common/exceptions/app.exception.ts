import { HttpException } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@repo/shared';

/**
 * Exception chuẩn của app — luôn kèm `errorCode` máy-đọc-được để FE
 * xử lý theo nhánh. Response format khớp `ApiErrorBody` của @repo/shared.
 */
export class AppException extends HttpException {
  constructor(
    statusCode: number,
    message: string,
    errorCode: ErrorCode,
    details?: unknown,
  ) {
    const body: ApiErrorBody = { statusCode, message, errorCode };
    if (details !== undefined) body.details = details;
    super(body, statusCode);
  }
}
