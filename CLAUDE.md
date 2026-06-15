# Monorepo — NestJS 11 (api) + Next.js 16 (web)

## Quy tắc BẮT BUỘC
- **Chỉ dùng `pnpm`** (workspace). KHÔNG dùng npm/yarn. Cài deps: `pnpm --filter <api|web|@repo/shared> add <pkg>`.
- TypeScript `strict: true` toàn repo. Không dùng `any` trừ khi bất khả kháng (kèm comment lý do).
- Type/schema dùng chung FE-BE đặt ở `packages/shared` (zod là source of truth, infer type từ zod).
- Không dùng axios. FE chỉ dùng custom fetch wrapper tại `apps/web/src/lib/api/`.
- Mọi mutation API phải đi qua AuditInterceptor (backend).
- Secrets chỉ ở `.env` — không hardcode, không commit.
- Trước khi báo hoàn thành 1 task: chạy `pnpm typecheck` và `pnpm lint` cho phần đã sửa.

## Lệnh thường dùng
| Việc | Lệnh |
|---|---|
| Chạy dev cả 2 app | `pnpm dev` |
| Chỉ API / Web | `pnpm dev:api` / `pnpm dev:web` |
| Bật Postgres+Redis local | `pnpm db:up` |
| Migration mới | `pnpm db:migrate <ten_migration>` |
| Seed roles/permissions/admin | `pnpm db:seed` |
| Migrate production | `pnpm db:deploy` |
| Backup / Restore | `pnpm db:backup` / `pnpm db:restore <file>` |

## Cấu trúc
```
apps/api        NestJS 11 — xem apps/api/CLAUDE.md
apps/web        Next.js 16 (App Router, proxy.ts) — xem apps/web/CLAUDE.md
packages/shared zod schemas + types + constants dùng chung (@repo/shared)
scripts/db      script database local & production
docker/         Dockerfile.api, Dockerfile.web
```

## Kiến trúc auth (tóm tắt — chi tiết trong PROMPT.md)
- Access token JWT 15m + Refresh token 30d (rotation, lưu **hash** trong bảng `Session`).
- Cả 2 token set qua **httpOnly + Secure + SameSite=Lax cookie**. FE không bao giờ đụng raw token.
- Revoke session ⇒ emit socket `session:revoked` ⇒ client đó bị logout realtime.
- Permission format `resource:action` (vd `user:read`). Check qua `@RequirePermissions()` + `PermissionsGuard`.

## Khi cần context
- Schema DB: `apps/api/prisma/schema.prisma`
- Danh sách permission/role mặc định: `packages/shared/src/constants/permissions.ts`
- Spec đầy đủ của template: `PROMPT.md` (chỉ đọc khi cần, file dài)
