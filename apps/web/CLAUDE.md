# apps/web — Next.js 16 (App Router)

## Stack
Next.js 16 (**dùng `src/proxy.ts` thay cho `middleware.ts`** — convention mới của Next 16), shadcn/ui, next-themes, sonner, input-otp, zustand, react-hook-form + zod (@hookform/resolvers), @tanstack/react-query v5, @tanstack/react-virtual, socket.io-client.

## Quy ước
- **KHÔNG dùng axios.** Mọi request đi qua `src/lib/api/client.ts` (custom fetch wrapper: credentials include, auto-refresh 401 single-flight, parse lỗi chuẩn).
- Server Components mặc định; chỉ thêm `"use client"` khi cần state/effect/event.
- Data fetching client-side: react-query. Query keys tập trung tại `src/lib/api/query-keys.ts`.
- Form: react-hook-form + zodResolver, schema import từ `@repo/shared` — KHÔNG viết lại schema.
- State toàn cục: zustand tại `src/stores/` (auth-store, ui-store). Không đưa server-state vào zustand.
- Toast: `sonner`. Theme: `next-themes` (class strategy).
- Bảng dài (audit log, sessions): bắt buộc dùng `@tanstack/react-virtual`.
- Route bảo vệ: check ở `proxy.ts` (đọc cookie) + guard component phía client cho permission-level.
- Socket: hook `useSocket()` tại `src/lib/socket.ts`, tự reconnect, lắng nghe `session:revoked`, `audit:created`.

## Lệnh (chạy từ root)
- `pnpm dev:web` | thêm shadcn component: `pnpm --filter web dlx shadcn@latest add <name>`
