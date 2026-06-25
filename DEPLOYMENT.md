# Hướng dẫn Deploy production (HRM monorepo)

Monorepo `pnpm` gồm: `apps/api` (NestJS), `apps/web` (Next.js 16), `packages/shared`.
Mục tiêu lượt này: **DB = Neon Postgres**, **FE = Vercel**, **BE = host container/VM**.
Cuối tài liệu có hướng dẫn chuyển sang Railway / Netlify / Cloudflare / Hetzner / DigitalOcean.

> Env mẫu: [`apps/api/env.production.example`](apps/api/env.production.example) (backend) và
> [`apps/web/env.production.example`](apps/web/env.production.example) (frontend). Copy → điền giá trị thật.

---

## 0. Kiến trúc & 2 nguyên tắc BẮT BUỘC đọc trước

```
Trình duyệt ──HTTPS──> [FE Next.js | Vercel]  app.example.com
        │
        └──HTTPS/WSS──> [BE NestJS  | host riêng] api.example.com
                              ├── Postgres (Neon)
                              ├── Redis (Upstash/Railway)  ← BullMQ + Socket.IO adapter
                              └── Object storage (Cloudflare R2 / S3)
```

### ⚠️ Nguyên tắc 1 — Backend KHÔNG deploy được lên Vercel (serverless)
NestJS ở đây cần **kết nối thường trực** (Socket.IO realtime), **worker nền** (BullMQ: email,
audit, notification push, recalc công), và **cron** (`@nestjs/schedule`: SLA, ABSENT, tạo partition).
Vercel/serverless không giữ kết nối socket, không chạy worker/cron, và có giới hạn thời gian hàm.
➡️ **FE lên Vercel, BE lên host chạy process thường trực** (Railway/Render/Fly/VPS). Đây là chuẩn.

### ⚠️ Nguyên tắc 2 — Cookie auth & quan hệ domain FE/BE (cấu hình bằng `COOKIE_SAMESITE`)
Auth dùng cookie `httpOnly + Secure`. `SameSite` cấu hình qua env `COOKIE_SAMESITE`. Chọn theo cách deploy:

- **FE & BE KHÁC domain** (vd Vercel `*.vercel.app` + Railway `*.up.railway.app`) — cách của bạn:
  - BE: `COOKIE_SAMESITE=none` + **để TRỐNG `COOKIE_DOMAIN`** (cookie host-only của BE) + `NODE_ENV=production` (Secure).
  - BE: `CORS_ORIGINS=https://<frontend>` (đúng origin, không `*`). CORS đã bật `credentials: true`.
  - FE phải gọi qua HTTPS; mọi request đã `credentials: include` sẵn.
  - ⚠️ `SameSite=None` bắt buộc HTTPS cả hai phía (Vercel/Railway đều HTTPS → OK).
- **FE & BE cùng registrable domain** (`app.example.com` + `api.example.com`):
  - `COOKIE_SAMESITE=lax` + `COOKIE_DOMAIN=.example.com`.
- **1 domain duy nhất** (VPS + Caddy proxy `/`→FE, `/api`→BE): `COOKIE_SAMESITE=lax`, `COOKIE_DOMAIN` trống.

---

## 1. Hạ tầng cần chuẩn bị (checklist)

| Thành phần | Lượt này | Vai trò |
|---|---|---|
| Postgres | **Neon** | Dữ liệu chính |
| Redis | **Upstash** (hoặc Railway) | BullMQ queue + Socket.IO adapter (BẮT BUỘC) |
| Object storage | **Cloudflare R2** (hoặc S3/B2) | Avatar, file hợp đồng, ảnh chấm công |
| Email | **Brevo** (hoặc SMTP) | OTP, mời tài khoản, thông báo |
| BE host | Railway/Render/Fly/VPS | Chạy NestJS thường trực |
| FE host | **Vercel** | Next.js |
| Domain | 1 domain + 2 subdomain | `app.` (FE) + `api.` (BE) |

---

## 2. Bước A — Database trên Neon

1. Tạo project tại https://neon.tech → chọn region gần BE host.
2. Vào **Connection Details**, lấy 2 chuỗi:
   - **Pooled** (có `-pooler`) → dùng cho APP runtime (`DATABASE_URL`).
   - **Direct** (không `-pooler`) → dùng khi CHẠY MIGRATE (Prisma cần kết nối trực tiếp).
   - Cả hai phải có `?sslmode=require`.
3. **Chạy migration + seed từ máy bạn** (trỏ vào Neon — DB production còn rỗng):
   ```bash
   pnpm install
   pnpm --filter @repo/shared build

   # MIGRATE dùng chuỗi DIRECT
   DATABASE_URL="postgresql://…neon.tech/db?sslmode=require" \
     pnpm --filter api exec prisma migrate deploy

   # SEED roles/permissions + tài khoản SUPER_ADMIN (cần SEED_ADMIN_*)
   DATABASE_URL="postgresql://…neon.tech/db?sslmode=require" \
   SEED_ADMIN_EMAIL="admin@example.com" SEED_ADMIN_PASSWORD="StrongP@ss" \
     pnpm --filter api exec tsx prisma/seed.ts
   ```
   > `migrate deploy` áp đủ cả các migration SQL thủ công (bảng `AttendanceLog` partition + hàm
   > `create_attendance_partition`). Neon (Postgres 15+) hỗ trợ đầy đủ.
4. Khi nâng cấp sau này: commit migration mới rồi chạy lại `prisma migrate deploy` (KHÔNG `migrate dev` trên prod).

---

## 3. Bước B — Redis (Upstash) + Storage (Cloudflare R2)

### Redis — Upstash
1. https://upstash.com → tạo Redis database (region gần BE).
2. Lấy **Endpoint host**, **Port**, **Password** (tab “Redis”/“TCP”).
3. Điền BE env: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, và **`REDIS_TLS=true`** (Upstash bắt buộc TLS).
   - Dùng Railway/Render Redis qua mạng nội bộ thì `REDIS_TLS=false`.

### Storage — Cloudflare R2 (S3-compatible)
1. Cloudflare dashboard → **R2** → tạo bucket (vd `hrm`).
2. Tạo **R2 API Token** → lấy Access Key / Secret Key / Account ID.
3. Điền BE env:
   ```
   S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=hrm
   S3_ACCESS_KEY=…
   S3_SECRET_KEY=…
   S3_FORCE_PATH_STYLE=true
   ```
   (AWS S3 / Backblaze B2 tương tự — đổi endpoint/region.)

---

## 4. Bước C — Deploy Backend (chọn 1 nền tảng)

Build BE (mọi nền tảng dùng chung ý tưởng): **build `@repo/shared` trước**, rồi build `api`.
Lệnh chuẩn:
```bash
pnpm install --frozen-lockfile
pnpm --filter @repo/shared build
pnpm --filter api build          # = prisma generate && nest build
node apps/api/dist/main.js       # start  (đặt cwd ở apps/api để chạy: cd apps/api && node dist/main.js)
```

> Repo có sẵn **2 file cấu hình dự phòng** cho 2 nền tảng này — chỉ cần push lên là dùng được:
> [`railway.json`](railway.json) và [`render.yaml`](render.yaml).

### C1) Railway (khuyến nghị — nhanh nhất)
1. New Project → **Deploy from GitHub repo** → chọn repo. Railway tự đọc [`railway.json`](railway.json)
   ở gốc repo (builder = Dockerfile `docker/Dockerfile.api`, healthcheck `/health`, 1 replica).
2. **Variables**: dán toàn bộ env backend (mục [env mẫu](apps/api/env.production.example)). Railway tự
   inject `PORT` → app đã tự lắng nghe `PORT`.
3. (Có thể thêm **Redis** plugin của Railway trong project → `REDIS_TLS=false`, dùng host nội bộ;
   hoặc dùng Upstash với `REDIS_TLS=true`.)
4. Gắn custom domain `api.example.com` (Settings → Networking → Custom Domain).

### C2) Render (Blueprint)
1. Dashboard → **New → Blueprint** → chọn repo. Render đọc [`render.yaml`](render.yaml): tạo
   **web service** `hrm-api` (Docker `docker/Dockerfile.api`, healthcheck `/health`) + **Redis nội bộ**
   `hrm-redis` (tự nối `REDIS_HOST`/`REDIS_PORT`). Sửa dòng `repo:` thành repo của bạn.
2. Render hỏi các biến `sync:false` (DATABASE_URL Neon, TOTP_ENCRYPTION_KEY, CORS_ORIGINS,
   COOKIE_DOMAIN, S3_*, SEED_ADMIN_*…). `JWT_*` Render tự sinh. Render inject `PORT`.
3. Gắn custom domain `api.example.com`.

### C3) Fly.io
- `fly launch` (không deploy ngay) → tạo `fly.toml`, dùng `docker/Dockerfile.api`.
- `fly secrets set DATABASE_URL=… JWT_ACCESS_SECRET=… …` cho mọi biến.
- `internal_port` khớp `API_PORT` (vd 8001). `fly deploy`.

### C4) VPS (Hetzner / DigitalOcean) — đơn giản nhất, 1 domain, KHỎI lo cookie
Repo có sẵn `docker-compose.prod.yml` + `docker/Caddyfile`: Caddy tự xin SSL Let's Encrypt và route
`/api`, `/socket.io`, `/storage` → API/MinIO, còn lại → Next.js. **Tất cả dưới 1 domain → same-origin,
cookie chạy hoàn hảo, kèm luôn Postgres + Redis + MinIO** (không cần Neon/Upstash/R2).
```bash
# trên VPS (đã cài Docker + Docker Compose), trỏ DNS A record của DOMAIN về IP VPS
git clone <repo> && cd hrm
cp apps/api/env.production.example .env   # gộp env + đặt DOMAIN=app.example.com, REDIS_PASSWORD=…
docker compose -f docker-compose.prod.yml up -d --build
# migrate chạy tự động qua service `migrate`; seed lần đầu:
docker compose -f docker-compose.prod.yml exec api node -e "require('child_process')"  # hoặc:
docker compose -f docker-compose.prod.yml run --rm migrate sh -lc "cd /app && pnpm --filter api exec tsx prisma/seed.ts"
```
> Mô hình này KHÔNG dùng Vercel. Nếu vẫn muốn FE trên Vercel, bỏ service `web` và trỏ
> `NEXT_PUBLIC_API_URL=https://app.example.com/api` (cùng domain qua Caddy) hoặc dùng `api.` subdomain.

---

## 5. Bước D — Deploy Frontend lên Vercel (monorepo)

Repo có sẵn [`apps/web/vercel.json`](apps/web/vercel.json) **đã cấu hình build command monorepo**
(build `@repo/shared` trước rồi build `web`) → Vercel tự đọc, không cần override thủ công.

1. Vercel → **Add New Project** → import repo.
2. **Root Directory**: `apps/web` (bấm Edit → chọn thư mục). Vercel sẽ đọc `vercel.json` ở đây.
3. Framework, Install/Build Command: tự lấy từ `vercel.json` (Next.js;
   `pnpm install --frozen-lockfile`; `pnpm --filter @repo/shared build && pnpm --filter web build`).
4. **Environment Variables** (mục [env mẫu FE](apps/web/env.production.example)):
   ```
   NEXT_PUBLIC_API_URL=https://your-api.up.railway.app/api
   NEXT_PUBLIC_WS_URL=https://your-api.up.railway.app
   NEXT_PUBLIC_APP_URL=https://your-frontend.vercel.app
   # (tuỳ chọn) NEXT_PUBLIC_FIREBASE_*…
   ```
   > `NEXT_PUBLIC_*` inline lúc build → đổi giá trị phải **Redeploy**.
5. Deploy. (Tuỳ chọn gắn custom domain — không bắt buộc vì đã hỗ trợ khác domain.)

---

## 6. Bước E — Domain, CORS, cookie (ráp nối — FE & BE KHÁC domain)

1. Lấy URL thật: FE `https://<app>.vercel.app`, BE `https://<api>.up.railway.app` (hoặc Render).
2. **BE env** (quan trọng cho auth cross-domain):
   - `NODE_ENV=production`
   - `CORS_ORIGINS=https://<app>.vercel.app` (đúng origin FE, không `*`)
   - `COOKIE_SAMESITE=none`  ← để cookie gửi được khi FE/BE khác domain
   - `COOKIE_DOMAIN=` (để TRỐNG — cookie host-only của BE)
   - `NEXT_PUBLIC_APP_URL=https://<app>.vercel.app` (đích redirect email + OAuth/2FA)
   - `GOOGLE_CALLBACK_URL=https://<api>.up.railway.app/api/auth/google/callback` (khai báo y hệt
     trong Google Cloud Console nếu dùng OAuth)
3. **FE env**: `NEXT_PUBLIC_API_URL=https://<api>…/api`, `NEXT_PUBLIC_WS_URL=https://<api>…`.
4. Đảm bảo BE chạy sau HTTPS (đã `app.set('trust proxy', 1)` để Secure cookie hoạt động sau proxy).

---

## 7. Bước F — Khởi tạo & kiểm thử

1. Migrate + seed (đã làm ở Bước A). Nếu seed sau khi BE chạy, có thể chạy trong container BE.
2. Đăng nhập bằng `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` → tạo Organization đầu tiên (org tự
   seed role org-level + mời ORG_ADMIN).
3. Smoke test:
   - `GET https://api.example.com/health` → ok.
   - Đăng nhập trên `app.example.com` → reload vẫn giữ phiên (xác nhận cookie cross-subdomain OK).
   - Mở 1 đơn → duyệt → kiểm tra realtime (socket) + chuông thông báo.
   - Vào Bảng công → **Xuất Excel** tải được file.
4. Khi đổi default role/permission về sau: chạy `pnpm db:sync-roles` (trỏ DATABASE_URL Neon).

---

## 8. Monorepo — thứ tự build & lệnh (tham chiếu mọi nền tảng)

- `@repo/shared` là source-of-truth (zod). **Phải build trước** `api`/`web`.
- Cài deps: luôn ở gốc, `pnpm install --frozen-lockfile` (đọc `pnpm-workspace.yaml`).
- Build:
  | App | Build | Start |
  |---|---|---|
  | shared | `pnpm --filter @repo/shared build` | — |
  | api | `pnpm --filter api build` | `cd apps/api && node dist/main.js` |
  | web | `pnpm --filter web build` | `pnpm --filter web start` (hoặc Vercel tự lo) |
- `pnpm-workspace.yaml` có `allowBuilds` cho native deps (argon2, prisma, sharp, firebase…). Nền tảng
  phải cho phép chạy build script của các package này (mặc định OK với Docker/Nixpacks).
- `apps/web/next.config.ts` có `output: 'standalone'` (phục vụ Docker). Trên Vercel không ảnh hưởng.

---

## 9. Chuyển nền tảng trong tương lai

- **Backend → Railway/Render/Fly/VPS**: như Bước C. Chỉ cần Postgres + Redis + Storage + env. Lưu ý
  chạy **1 instance** (cron/worker chạy trong process API; scale nhiều instance sẽ chạy trùng cron).
- **Frontend → Netlify**: Base directory `apps/web`; Build `pnpm --filter @repo/shared build && pnpm --filter web build`;
  cài `@netlify/plugin-nextjs`. Env `NEXT_PUBLIC_*` như Vercel.
- **Frontend → Cloudflare Pages**: dùng `@cloudflare/next-on-pages` (cần kiểm thử — Next 16 App
  Router). Build tương tự; set env `NEXT_PUBLIC_*`. (Cloudflare Workers KHÔNG chạy được BE NestJS.)
- **Storage → R2/S3/B2**: chỉ đổi 5 biến `S3_*`. **Email → Brevo/SMTP**: đổi `BREVO_API_KEY`/`MAIL_*`.
- **DB → Railway/Supabase/RDS**: đổi `DATABASE_URL` (migrate dùng chuỗi direct nếu có PgBouncer).

---

## 10. Checklist trước khi go-live

- [ ] Cookie đúng quan hệ domain: khác domain → `COOKIE_SAMESITE=none` + `COOKIE_DOMAIN` trống;
      cùng registrable domain → `lax` + `COOKIE_DOMAIN=.example.com`. Cả hai đều HTTPS.
- [ ] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥32 ký tự), `TOTP_ENCRYPTION_KEY` (64 hex) — random, KHÁC nhau, KHÔNG commit.
- [ ] `CORS_ORIGINS` = đúng domain FE; `NODE_ENV=production` (bật Secure cookie).
- [ ] Redis bật `REDIS_TLS` đúng (Upstash=true). `REDIS_PASSWORD` mạnh.
- [ ] Đã `prisma migrate deploy` + `seed` + (nếu cần) `db:sync-roles`.
- [ ] Storage bucket riêng cho prod; Brevo sender đã verify.
- [ ] `GOOGLE_CALLBACK_URL` (nếu dùng) khớp Google Console.
- [ ] BE chạy đúng 1 instance (tránh trùng cron) hoặc tách worker nếu cần scale.
- [ ] `/health` xanh; đăng nhập giữ phiên sau reload; realtime + xuất Excel hoạt động.
