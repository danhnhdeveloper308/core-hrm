Tạo module NestJS mới tên: $ARGUMENTS

Thực hiện theo đúng quy ước trong apps/api/CLAUDE.md:
1. Tạo `apps/api/src/modules/$ARGUMENTS/` với module/controller/service/dto.
2. Zod schema cho DTO đặt ở `packages/shared/src/schemas/$ARGUMENTS.ts` và export.
3. Thêm permission `$ARGUMENTS:read|create|update|delete` vào `packages/shared/src/constants/permissions.ts` + cập nhật seed.
4. Gắn `@RequirePermissions` cho từng route, thêm Swagger decorators.
5. Đăng ký module vào AppModule. Chạy `pnpm typecheck`.
