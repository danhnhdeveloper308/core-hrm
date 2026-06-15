# apps/api — NestJS 11

## Stack
NestJS 11, Prisma + PostgreSQL, BullMQ + ioredis, Socket.IO gateway, @nestjs/swagger, helmet, @nestjs/throttler, winston (nest-winston), argon2, otplib + qrcode (2FA), class-validator KHÔNG dùng — validate bằng zod qua `ZodValidationPipe` (nestjs-zod) để tái sử dụng schema từ `@repo/shared`.

## Quy ước
- 1 module = 1 thư mục trong `src/modules/<name>/` gồm: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `events/` (nếu có).
- Controller mỏng, logic nằm trong service. Service không import service của module khác trực tiếp nếu có thể dùng event (EventEmitter2).
- DTO: import zod schema từ `@repo/shared`, dùng `createZodDto`.
- Mọi endpoint có `@ApiOperation` + `@ApiOkResponse`. Swagger tại `/api/docs`.
- Route mutation: phải có `@RequirePermissions(...)` hoặc `@Public()` rõ ràng — không để mặc định.
- Lỗi: throw exception chuẩn Nest, response format thống nhất `{ statusCode, message, errorCode, details? }` qua global filter.
- Background job: dùng BullMQ queue trong `src/queues/` (vd gửi email OTP, ghi audit nặng).
- Test e2e cho auth flows nằm ở `test/`.

## Lệnh (chạy từ root)
- `pnpm dev:api` | `pnpm --filter api test` | `pnpm --filter api exec prisma studio`
