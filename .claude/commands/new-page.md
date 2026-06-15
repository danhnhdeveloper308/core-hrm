Tạo page Next.js mới: $ARGUMENTS

Theo quy ước apps/web/CLAUDE.md:
1. Route trong `apps/web/src/app/`, Server Component mặc định.
2. Data qua react-query + fetch wrapper, query key thêm vào query-keys.ts.
3. Form (nếu có) dùng react-hook-form + zod schema từ @repo/shared.
4. UI dùng shadcn/ui, hỗ trợ dark mode. Chạy `pnpm typecheck`.
