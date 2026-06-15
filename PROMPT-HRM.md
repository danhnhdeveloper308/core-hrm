# PROMPT — Hệ thống HRM đa doanh nghiệp (Attendance thông minh + Leave + Approval)

> **Cách dùng:** copy template **forge** (NestJS 11 + Next 16 + Prisma 7 + Redis + BullMQ + Socket.IO — đã có auth/RBAC/realtime/audit/CI/deploy) thành project mới, đặt file này ở root, rồi yêu cầu Claude Code:
> *"Đọc PROMPT-HRM.md và thực hiện tuần tự từng Phase. Sau mỗi Phase chạy gate (typecheck/lint/test liên quan), commit rồi tiếp tục. Không hỏi lại các quyết định đã chốt trong file."*

---

## 0. Nguyên tắc bắt buộc (áp dụng mọi Phase)

1. **Nền tảng là template forge — TÁI SỬ DỤNG, không viết lại.** Map nhanh:

   | Cần | Dùng sẵn |
   |---|---|
   | Auth, 2FA, session, trusted device, lockout | `modules/auth`, `modules/sessions` |
   | Phân quyền + cache + invalidation | `PermissionsGuard`, `@RequirePermissions`, `modules/rbac` |
   | Ghi audit mọi mutation | `@Audit('resource.action')` + `addAuditMetadata()` (diff) |
   | Background job | pattern `src/queues/*.queue.ts` (BullMQ raw) |
   | Realtime đến FE | `EventEmitter2` → `EventsGateway` (thêm event vào `SocketEvents` ở shared) |
   | Gửi mail | `MailService` + `EmailQueueService` (thêm job type mới) |
   | Cron | `@Cron` trong service (xem `SessionsService.cleanupExpiredSessions`) |
   | FE fetch + auto-refresh | `lib/api/client.ts`; query keys ở `lib/api/query-keys.ts` |
   | FE form | RHF + zodResolver, schema import từ `@repo/shared` |
   | Bảng dữ liệu danh sách | **AG Grid** (per 2.12); `@tanstack/react-virtual` chỉ giữ cho feed kiểu audit realtime |
   | Mời nhân viên vào hệ thống | flow invite có sẵn (`/users/invite` + `/accept-invite`) |

2. **Chỉ pnpm** (`pnpm --filter <pkg> add ...`), phiên bản mới nhất stable. TypeScript strict. Zod ở `@repo/shared` là source of truth cho mọi DTO/type dùng chung — tuyệt đối không duplicate schema.
3. **Tiết kiệm token:** không đọc lại toàn bộ file này mỗi phase (chỉ đọc mục 1–3 + phase đang làm); không khảo sát thư viện thay thế khi file đã chốt; không viết tài liệu/diagram ngoài yêu cầu; không unit-test code generated; hỏi lại CHỈ khi spec mâu thuẫn.
4. **Gate mỗi phase:** `pnpm typecheck` + `pnpm lint` + test liên quan pass → `git add -A && git commit -m "phase N: ..."` → phase tiếp. Phase có ghi *Acceptance* thì phải tự chạy lệnh kiểm chứng trước khi commit.
5. Code production-grade: xử lý lỗi đầy đủ qua `AppException` + `ERROR_CODES`, không TODO bỏ ngỏ, mutation route luôn có `@Audit` + `@RequirePermissions`.
6. **KHÔNG làm trong v1:** tính lương đầy đủ (chỉ export dữ liệu công), mobile app native (PWA đủ), SSO SAML, OCR giấy tờ, chat nội bộ, đa ngôn ngữ (giữ tiếng Việt), cross-org user.

## 1. Mục tiêu & định cỡ

- Multi-tenant: **50+ doanh nghiệp, tổng > 10.000 nhân viên** trên 1 deployment.
- Tải đỉnh: giờ check-in sáng ~100 req/s; thiết bị vân tay push liên tục. p95 API < 300ms; flow check-in mặt < 2s.
- Dữ liệu lớn nhất: `AttendanceLog` (~10k user × 4 log/ngày ≈ 15 triệu dòng/năm) → **partition theo tháng** + retention.
- Mọi truy vấn nghiệp vụ bắt buộc đi qua scope `orgId` (xem mục 2.1) + cursor pagination cho danh sách lớn.

## 2. Quyết định kiến trúc ĐÃ CHỐT (không cân nhắc lại)

### 2.1 Multi-tenant: row-based, 1 database
- Model `Organization`; mọi bảng nghiệp vụ có cột `orgId` + index compose `(orgId, ...)`; unique constraint luôn compose với `orgId` (vd `@@unique([orgId, code])`).
- **QUAN TRỌNG — ranh giới tenant:** 1 **tập đoàn = 1 Organization** (1 tenant). Các công ty thành viên/khối ngành/chuỗi/nhà máy là **OrgUnit** bên trong tenant đó (mục 2.10) — vì cần báo cáo hợp nhất, điều chuyển nhân sự nội bộ và 1 lần đăng nhập. Chỉ tách Organization khi 2 pháp nhân hoàn toàn không liên quan.
- User thuộc đúng 1 org (`User.orgId` nullable — null = platform admin). JWT payload thêm `orgId`; `AccessTokenPayload` mở rộng tương ứng.
- **TenantGuard** (sau JwtAuthGuard): gắn `request.orgId`; service nhận `orgId` qua tham số đầu tiên — KHÔNG dùng Prisma middleware magic, scope tường minh trong từng query (dễ review, khó rò rỉ).
- Role mở rộng: thêm `Role.orgId` nullable (null = role hệ thống platform). Seed thêm role org-level: `ORG_ADMIN`, `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE` với map permission mặc định.
- Permission mới (thêm vào `packages/shared/constants/permissions.ts`): `org:read|update`, `employee:read|create|update|delete`, `orgunit:manage`, `shift:manage`, `attendance:read|read_all|correct`, `leave:read|request|approve|manage_policy`, `approval:manage_flow`, `device:manage`, `worksite:manage`, `report:read`, `face:enroll|manage`.
- Platform admin (SUPER_ADMIN, orgId=null): CRUD organizations, không thấy dữ liệu nghiệp vụ chi tiết của org trừ khi được cấp.

### 2.2 Face check-in: 1:1 verification (KHÔNG phải 1:N)
- User đã đăng nhập tự chụp ảnh → server chỉ so với embeddings **của chính user đó** → không cần vector DB, không cần GPU.
- Thư viện: **`@vladmandic/human`** chạy trên API (Node, TFJS CPU backend). Model files commit vào `apps/api/models/` (hoặc tải về lúc build — chọn cách đơn giản chạy được).
- Enrollment: chụp 3–5 ảnh → mỗi ảnh 1 embedding (Float32Array 1024d của human) → lưu `FaceProfile.embeddings Json` (mảng vector). Yêu cầu quality: 1 khuôn mặt/ảnh, faceScore ≥ 0.8, ảnh mờ/nghiêng quá → reject với message rõ.
- Verify khi check-in: cosine similarity với từng embedding đã enroll, lấy max; **ngưỡng mặc định 0.55**, configurable qua env `FACE_MATCH_THRESHOLD`. Bật antispoof model của human; điểm liveness < 0.5 → từ chối kèm `ERROR_CODES.FACE_SPOOF_SUSPECTED`.
- Ảnh check-in lưu object storage (mục 2.5) để HR đối soát; URL ký tạm thời khi xem.
- Giới hạn chấp nhận (ghi vào README, không cố giải): chống spoof trên web là best-effort; máy vân tay là kênh chống gian lận mạnh hơn.

### 2.3 Location check-in: geofence
- `Worksite` (orgId, name, lat, lng, radiusM mặc định 100). Browser Geolocation gửi `{lat, lng, accuracy}` → haversine ≤ radiusM → hợp lệ.
- `accuracy > 200m` → vẫn cho check-in nhưng flag `locationSuspect=true` (HR thấy cảnh báo). Không chống được mock GPS tuyệt đối trên web — flag + ảnh mặt là cơ chế đối soát.
- Nhân viên gán worksite mặc định; org bật/tắt yêu cầu face/location per worksite (`requireFace`, `requireLocation`).

### 2.4 Máy chấm vân tay: chuẩn ZKTeco ADMS/iclock push
- Thiết bị tự POST về server (cấu hình "Cloud Server" trên máy = domain hệ thống). Implement controller `@Public()` prefix `/iclock`:
  - `GET /iclock/cdata?SN=...` — handshake: trả options (`GET OPTION FROM: ...`, realtime=1, timezone).
  - `POST /iclock/cdata?SN=...&table=ATTLOG` — body text từng dòng `PIN\tTIMESTAMP\tSTATUS\tVERIFY...` → parse, trả `OK: n`.
  - `GET /iclock/getrequest?SN=...` — trả `OK` (v1 không đẩy lệnh xuống máy).
- `AttendanceDevice` (orgId, serialNumber unique, name, worksiteId, lastSeenAt, status). Máy lạ (SN chưa đăng ký) → log warning, bỏ qua data.
- `EmployeeDeviceCode` map `(orgId, deviceCode)` ↔ employeeId (deviceCode = PIN user trên máy).
- Ingest qua BullMQ queue `attendance-ingest`: dedupe theo unique `(deviceSerial, deviceCode, recordedAt)`, tạo `AttendanceLog source=FINGERPRINT`, không match được employee → bảng chờ `UnmatchedDeviceLog` cho HR map tay.
- Bảo mật: endpoint iclock rate-limit riêng + chỉ chấp nhận SN đã đăng ký; (chuẩn iclock không có auth — chấp nhận, ghi chú).

### 2.5 Object storage: MinIO (mặc định cả dev lẫn production)
- **MinIO self-host là storage chính thức**: service trong cả `docker-compose.yml` (dev, mở console :9001) lẫn `docker-compose.prod.yml` (volume riêng `miniodata`, KHÔNG publish port ra ngoài — chỉ api truy cập qua network nội bộ; signed URL public đi qua route Caddy `/storage/*` → minio:9000).
- Interface `StorageProvider` (pattern như `MailProvider`): `put/getSignedUrl/delete`, driver S3 SDK v3 — code không biết gì về MinIO nên sau này đổi sang AWS S3/R2 chỉ là đổi env, không sửa code.
- Bucket tạo tự động lúc boot nếu chưa có (`hrm`). Key convention: `{orgId}/checkin/{employeeId}/{date}/...`, `{orgId}/docs/...` — orgId đứng đầu để cách ly tenant.
- Dùng cho: ảnh check-in, avatar, tài liệu hồ sơ nhân viên, file report export.

### 2.6 Leave: ledger, không lưu số dư tĩnh
- Số dư = `SUM(LeaveBalanceEntry.amount)` theo (employeeId, leaveTypeId, năm hiệu lực). Entry types: `ACCRUAL, USAGE, REVERT, CARRY_OVER, EXPIRY, ADJUSTMENT` — mọi thay đổi đều là bút toán có lý do, không UPDATE số dư.
- `LeavePolicy` per (org, leaveType): `daysPerYear`, `accrualType: YEARLY_UPFRONT | MONTHLY` (MONTHLY = cộng dần daysPerYear/12 mỗi đầu tháng), `prorateFirstYear` (nhân viên vào giữa năm nhận pro-rata theo tháng còn lại), `seniorityBonus` (vd +1 ngày mỗi 5 năm thâm niên), `carryOverMaxDays` + `carryOverExpiresOn` (vd 31/03 — entry CARRY_OVER có `expiresAt`, cron tạo entry EXPIRY phần chưa dùng), `allowNegativeBalance` (bool).
- Cron BullMQ: đầu năm/đầu tháng chạy accrual cho toàn bộ employee active (idempotent — unique `(employeeId, leaveTypeId, period, reason)`); cron hết hạn carry-over.
- Đơn nghỉ `LeaveRequest`: range ngày + buổi (sáng/chiều/cả ngày), tính số ngày trừ ngày nghỉ lễ/cuối tuần theo lịch org. Submit → khoá tạm số dư (entry USAGE pending? KHÔNG — chốt: chỉ trừ khi APPROVED, nhưng validate số dư khả dụng = balance − tổng pending). Approve → entry USAGE âm; cancel/reject sau approve → entry REVERT dương.

### 2.7 Timesheet engine: tính qua queue, không tính trong request
- `TimesheetDay` unique `(employeeId, date)`: shiftId, firstIn, lastOut, status `PRESENT|LATE|EARLY_LEAVE|LATE_AND_EARLY|ABSENT|ON_LEAVE|HALF_LEAVE|HOLIDAY|WEEKEND|NOT_SCHEDULED`, lateMinutes, earlyMinutes, workMinutes, otMinutes (OT = ngoài ca, chỉ tính khi có OTRequest approved — v1: cột để sẵn, rule đơn giản max(0, lastOut − shiftEnd) khi flag bật).
- Trigger recalc (đẩy job `timesheet-recalc` {employeeId, date}): AttendanceLog mới, LeaveRequest đổi trạng thái, đổi ca/lịch, sửa log thủ công. Job idempotent — tính lại toàn bộ ngày đó từ dữ liệu gốc.
- Grace period per shift (`lateGraceMinutes` mặc định 5).

### 2.8 Approval engine: N cấp, định tuyến theo cây tổ chức, có điều kiện
- `ApprovalFlow` per (org, targetType: `LEAVE|ATTENDANCE_CORRECTION|OT`): `name`, `priority` int, `conditions Json?` (vd `{"totalDays": {"gt": 3}}`, `{"leaveTypeCode": "UNPAID"}`) + danh sách **`ApprovalFlowStep`** (order 1..n, không giới hạn số cấp):
  - `approverType`: `DIRECT_MANAGER` (Employee.managerId) | `MANAGEMENT_CHAIN` (+`chainLevel`: leo n cấp manager) | `UNIT_MANAGER_OF_TYPE` (+`unitTypeCode`: manager của OrgUnit **tổ tiên gần nhất** có loại đó — vd "Giám đốc Nhà máy", "TGĐ Công ty thành viên", "Trưởng Khối ngành") | `ROLE` (+roleId, vd HR tập đoàn) | `SPECIFIC_USER` (+userId).
  - `slaHours?`: quá hạn chưa duyệt → job nhắc (notification 2.11) cho approver + CC cấp trên; v1 chỉ nhắc, không auto-escalate.
- **Chọn flow:** nhiều flow cùng targetType → lấy flow `priority` cao nhất có `conditions` match với đơn (không match điều kiện nào = flow mặc định). Ví dụ thực tế: nghỉ ≤ 3 ngày = 1 cấp (DIRECT_MANAGER); > 3 ngày = DIRECT_MANAGER → UNIT_MANAGER_OF_TYPE(NHA_MAY) → ROLE(HR_MANAGER).
- **Resolve approver động** tại thời điểm submit, theo vị trí của requester trên cây OrgUnit: mỗi step resolve ra danh sách user (≥1); bất kỳ ai trong số đó approve là qua bước (OR). Resolve rỗng hoặc ra chính requester → **auto-skip** step + ghi log vào instance. Lưu snapshot resolved approvers vào step instance (cây tổ chức đổi sau đó không ảnh hưởng đơn đang chạy).
- `ApprovalInstance` (targetType, targetId, flowId, currentStep, status `PENDING|APPROVED|REJECTED|CANCELLED`, stepsSnapshot Json) + `ApprovalAction` (step, actorId, decision `APPROVE|REJECT`, note, decidedAt).
- Approve bước cuối → emit event nghiệp vụ (`leave.approved`...) cho module đích (ledger, timesheet). Mọi chuyển trạng thái → notification 3 kênh (2.11) cho requester + approver bước kế.
- Người có permission `leave:approve` toàn org (HR) luôn có thể duyệt thay bất kỳ step nào (ghi rõ "duyệt thay" trong ApprovalAction.note + audit) — cơ chế thoát khi manager vắng, không làm delegation engine riêng.

### 2.10 Cơ cấu tổ chức: OrgUnit N tầng, loại đơn vị tự cấu hình
- **Bỏ model Department phẳng.** Dùng cặp:
  - `OrgUnitType` (orgId, code, name, rank int): mỗi org tự định nghĩa các tầng. Seed sẵn 2 preset chọn khi tạo org: **"Công ty đơn"** (`CONG_TY → PHONG_BAN → TO_DOI`) và **"Tập đoàn sản xuất"** (`TAP_DOAN → KHOI_NGANH → CHUOI → CONG_TY_TV → NHA_MAY/TO_HOP → PHONG_BAN → TO_DOI`). Org admin thêm/sửa type tuỳ ý — cây KHÔNG ép đúng thứ tự rank (nhà máy có thể trực thuộc thẳng công ty TV), rank chỉ để gợi ý UI và resolve approver.
  - `OrgUnit` (orgId, parentId?, typeId, name, code, managerId? → Employee, **path** string): cây sâu tuỳ ý. `path` = materialized path `"/rootId/.../selfId/"` (cập nhật khi move node — move = update path cả subtree trong 1 transaction), index `(orgId, path)` → query subtree bằng `path startsWith` thay vì recursive CTE, rẻ ở quy mô 10k+ users.
- `Employee.orgUnitId` (thay departmentId). Employee thuộc đúng 1 unit (lá hoặc giữa đều được).
- **Scope dữ liệu theo subtree:** manager của OrgUnit (hoặc user được gán permission có scope) chỉ thấy nhân viên/chấm công/đơn từ trong subtree của unit mình quản lý — implement helper `getManagedSubtreePaths(userId)` trả list path prefix, mọi query list của role manager filter thêm điều kiện này. HR/ORG_ADMIN scope toàn org.
- Cấu hình kế thừa theo cây: HolidayCalendar/WorkShift mặc định/LeavePolicy có thể gán cho OrgUnit; resolve = leo từ unit của employee lên cha gần nhất có cấu hình, cuối cùng fallback org default.

### 2.11 Notification center: in-app + FCM push + email
- **3 kênh hợp nhất** qua `NotificationService.dispatch(userIds, payload)` → BullMQ queue `notification` fan-out: (a) ghi bảng `Notification` + socket `notification:new` (badge realtime — gateway sẵn có), (b) **FCM push** tới mọi DeviceToken của user, (c) email cho các loại quan trọng (cờ `emailEnabled` theo notification type).
- **FCM:** `firebase-admin` trên API; env `FIREBASE_SERVICE_ACCOUNT` (đường dẫn file JSON hoặc chuỗi base64) — **optional**: thiếu config → provider null, skip push không lỗi (pattern như Google OAuth/Brevo). Token UNREGISTERED/INVALID từ FCM response → xoá DeviceToken ngay.
- `DeviceToken` (userId, token unique, platform `WEB|ANDROID|IOS`, lastSeenAt) + API `POST/DELETE /notifications/tokens`. `Notification` (userId, type, title, body, data Json, readAt?) + API list cursor + mark-read/mark-all.
- FE web: Firebase JS SDK + `public/firebase-messaging-sw.js` (nhận push khi tab đóng), xin quyền sau khi login (không xin ở landing), env `NEXT_PUBLIC_FIREBASE_*` (apiKey, projectId, messagingSenderId, appId, vapidKey). Chuông notification trên header: badge số chưa đọc, dropdown danh sách, realtime qua socket.
- Mobile sau này (nếu có app) chỉ cần đăng ký token vào cùng API — kiến trúc không đổi.

### 2.12 UI hiện đại: motion + animejs + AG Grid (kèm guardrails hiệu suất)
**Phong cách:** hiện đại đậm tính công nghệ trên nền shadcn/ui sẵn có — accent gradient tinh tế, dark mode hoàn chỉnh, micro-interaction mượt; KHÔNG glassmorphism/particle nặng nề tràn lan.

**Phân vai 3 thư viện (cài ở Phase 1, đều bản mới nhất stable):**
- **`motion`** (tên mới của framer-motion, import từ `motion/react`): page transition nhẹ, animation vào/ra của card–dialog–sheet–sidebar, stagger khi list xuất hiện, hover/tap micro-interaction. **Bắt buộc dùng `LazyMotion` + component `m.*` + `domAnimation`** thay vì import `motion.*` đầy đủ — giảm ~70% bundle animation.
- **`animejs`** (v4): CHỈ cho hiệu ứng "trang trí công nghệ" điểm nhấn — số liệu dashboard đếm tăng (count-up), vẽ đường SVG, hiệu ứng logo/empty-state. **Luôn `dynamic import` trong component dùng nó** — không vào bundle chung.
- **`ag-grid-community` + `ag-grid-react`**: thay thế bảng tự dựng cho MỌI bảng dữ liệu danh sách (employees, bảng công tháng employee×ngày, số dư phép toàn org, log thiết bị, report preview). Bản Community (MIT) đủ: sort/filter/resize/pin column + row virtualization. Bảng < 2.000 dòng dùng Client-Side Row Model (fetch 1 lần); danh sách lớn dùng **Infinite Row Model** nối với cursor pagination sẵn có của backend. Theme Quartz, sync dark mode với next-themes. KHÔNG dùng tính năng Enterprise (row grouping/pivot — trả phí).
- Tạo **`components/motion/primitives.tsx`** dùng chung (`<FadeIn>`, `<SlideUp>`, `<StaggerList>`, `<CountUp>`) — mọi page dùng qua primitives này, không viết animation rải rác mỗi nơi một kiểu.

**Guardrails hiệu suất (bắt buộc, kiểm ở Phase 10):**
1. Chỉ animate `transform`/`opacity` (GPU) — cấm animate width/height/top gây reflow; duration tương tác ≤ 300ms.
2. Tôn trọng `prefers-reduced-motion` (hook `useReducedMotion` → tắt non-essential).
3. KHÔNG animation per-row trong AG Grid/danh sách dài — chỉ animate container; không animation lặp vô hạn ở trang nền.
4. Trang `/checkin` (chạy trên điện thoại yếu) giữ animation tối thiểu — ưu tiên tốc độ mở camera.
5. Gate Phase 10: Lighthouse Performance ≥ 90 cho `/` và `/dashboard` (production build).

### 2.9 Partition AttendanceLog
- Prisma không hỗ trợ declarative partitioning → migration SQL thủ công: tạo bảng partitioned by RANGE (`recordedAt`), partition theo tháng, function + cron (pg hoặc BullMQ monthly) tạo partition tháng kế. Prisma schema map bảng như thường (`@@map`). Viết rõ trong migration đầu của Phase 4; nếu vướng với `prisma migrate dev`, dùng `migrate dev --create-only` rồi sửa SQL.

## 3. Data model (tóm tắt — generate schema từ đây)

> Tất cả bảng nghiệp vụ: `id uuid`, `orgId` (FK Organization, index compose), `createdAt`, `updatedAt`. Dưới đây chỉ liệt kê field đặc thù.

- **Organization**: name, slug unique, status, timezone (default `Asia/Ho_Chi_Minh`), settings Json.
- **Worksite**: name, address, lat, lng, radiusM, requireFace bool, requireLocation bool.
- **OrgUnitType**: code, name, rank int (per 2.10).
- **OrgUnit**: parentId?, typeId, name, code, managerId? (Employee), path string index (per 2.10).
- **Position**: name, code.
- **Employee** (1–1 User, User.orgId trùng): code unique/org, fullName, dob?, gender?, phone?, orgUnitId?, positionId?, managerId? (Employee), worksiteId?, joinDate, leaveDate?, status `ACTIVE|PROBATION|INACTIVE|TERMINATED`, avatarKey?.
- **EmploymentContract**: employeeId, type `PROBATION|FIXED_TERM|INDEFINITE`, startDate, endDate?, fileKey?, note.
- **WorkShift**: name, startTime "HH:mm", endTime, breakMinutes, lateGraceMinutes, otEnabled bool, workDays int[] (1–7).
- **ShiftAssignment**: employeeId, shiftId, effectiveFrom, effectiveTo? (lịch sử đổi ca; ca áp dụng = bản ghi active tại ngày đó).
- **HolidayCalendar** + **Holiday** (calendarId, date, name, isHalfDay) — org gán 1 calendar.
- **AttendanceDevice / EmployeeDeviceCode / UnmatchedDeviceLog**: như 2.4.
- **AttendanceLog** (partitioned): employeeId, recordedAt, type `IN|OUT|UNKNOWN`, source `FACE|FINGERPRINT|MANUAL|WEB`, worksiteId?, lat?, lng?, accuracy?, locationSuspect bool, faceScore?, photoKey?, deviceId?, note?, createdById? (manual). Unique chống trùng: `(employeeId, recordedAt, source)`.
- **TimesheetDay**: như 2.7.
- **AttendanceCorrection**: employeeId, date, requestedIn?, requestedOut?, reason, status (đi qua Approval) → approve tạo AttendanceLog MANUAL + recalc.
- **FaceProfile**: employeeId unique, embeddings Json, photoKeys string[], enrolledAt, updatedBy.
- **LeaveType**: name, code, paid bool, color.
- **LeavePolicy / LeaveRequest / LeaveBalanceEntry**: như 2.6. LeaveRequest: leaveTypeId, startDate, endDate, startHalf `FULL|AM|PM`, endHalf, totalDays decimal, reason, status `PENDING|APPROVED|REJECTED|CANCELLED`.
- **ApprovalFlow / ApprovalFlowStep / ApprovalInstance / ApprovalAction**: như 2.8.
- **DeviceToken / Notification**: như 2.11.
- Kế thừa nguyên trạng từ template: User/Role/Permission/Session/Device/AuditLog/VerificationToken/RecoveryCode (chỉ thêm `orgId` vào User + Role).

## 4. Các Phase

### Phase 0 — Khởi tạo từ template + đổi định danh sang HRM
- Copy forge → repo mới (thư mục đặt tên `hrm` — docker compose lấy tên thư mục làm project name).
- **Đổi toàn bộ định danh `app_*`/generic → `hrm`** (làm máy móc theo bảng, xong grep `-ri "app_db\|app_postgres\|app_redis\|MyApp\|Forge"` toàn repo trừ node_modules để chắc không sót):

  | Chỗ | Cũ → Mới |
  |---|---|
  | Root `package.json` name | `monorepo` → `hrm` |
  | `.env.example` + `.env`: `POSTGRES_USER/PASSWORD/DB` | `app`/`app_secret`/`app_db` → `hrm`/`hrm_secret`/`hrm_db` (+ `DATABASE_URL` theo) |
  | `docker-compose.yml` container_name | `app_postgres`/`app_redis` → `hrm_postgres`/`hrm_redis` (sửa luôn lệnh trong `scripts/db/*.sh` nếu có tham chiếu) |
  | MinIO (thêm mới ở phase này) | container `hrm_minio`, bucket `hrm`, volume `miniodata` |
  | `TOTP_ISSUER` | `MyApp` → `HRM` |
  | `MAIL_FROM_NAME` | → `"HRM System"` |
  | Swagger `DocumentBuilder` title/description (`main.ts`) | `API` → `HRM API` |
  | Winston logger app label (`winston.logger.ts`) | `api` → `hrm-api` |
  | FE brand: landing page, header sidebar, `<title>`/metadata (layout) | `Forge` → `HRM` (tên sản phẩm) |
  | README tiêu đề + CI env (`.github/workflows/ci.yml` `DATABASE_URL`) | theo tên mới |

  KHÔNG đổi: tên package workspace `api`/`web`/`@repo/shared` (giữ để mọi lệnh `pnpm --filter` trong tài liệu template còn đúng).
- Tạo `.env` từ `.env.example` (secrets mới: `openssl rand -hex 32`). Chạy: `pnpm i && pnpm db:up && pnpm db:migrate init && pnpm db:seed && pnpm typecheck && pnpm lint && pnpm test && NODE_ENV=test pnpm --filter api test:e2e` — tất cả phải pass trước khi viết dòng code mới nào.
- Thêm MinIO vào cả `docker-compose.yml` (dev) lẫn `docker-compose.prod.yml` (per 2.5, kèm route `/storage/*` trong Caddyfile) + env S3_* + `StorageModule` (provider theo 2.5, auto-create bucket lúc boot) + smoke test put/getSignedUrl.
- **Acceptance:** grep định danh cũ = 0 kết quả (ngoài node_modules/lock file); checklist nền pass; upload/đọc 1 file qua StorageProvider.

### Phase 1 — Multi-tenancy + Cơ cấu tổ chức N tầng
- Migration: `User.orgId?`, `Role.orgId?`, model Organization/Worksite/OrgUnitType/OrgUnit/Position. Cập nhật `@repo/shared`: schemas tương ứng + permissions mới + roles org-level (`ORG_ADMIN, HR_MANAGER, UNIT_MANAGER, EMPLOYEE`) + map mặc định; seed cập nhật.
- `TenantGuard` + `@CurrentOrg()` decorator; JWT payload thêm `orgId`. Login flow: user có orgId → response kèm org info.
- Platform admin API: CRUD Organization — tạo org chọn **preset cơ cấu** ("Công ty đơn" / "Tập đoàn sản xuất" per 2.10) → auto tạo OrgUnitType set + unit gốc + ORG_ADMIN roles + mời org admin đầu tiên (flow invite sẵn có).
- API org-scoped: CRUD OrgUnitType; CRUD OrgUnit (tạo/sửa/**move node** — cập nhật path cả subtree trong transaction, cấm move vào chính subtree của mình), gán manager; CRUD Position, Worksite. Helper `getManagedSubtreePaths(userId)` + áp filter subtree vào mọi API list từ Phase 2 trở đi.
- FE: cài + setup bộ UI per 2.12 (`motion` với LazyMotion, `animejs`, AG Grid + theme Quartz sync dark mode, file `components/motion/primitives.tsx`). Trang platform `/dashboard/organizations`; org admin: `/dashboard/settings/org-structure` (**tree view** gọn: expand/collapse, thêm con, move, gán manager, hiện loại đơn vị), `/dashboard/settings/{positions,worksites,unit-types}`.
- **Acceptance:** e2e — tạo org preset tập đoàn (cây ≥ 4 tầng), org admin chỉ thấy dữ liệu org mình; user org A gọi resource org B → 403/404; move unit → path subtree cập nhật đúng; manager nhà máy chỉ list được employee trong subtree (test ở Phase 2 nhắc lại).

### Phase 2 — Employee management
- Model Employee + EmploymentContract. Tạo employee = tạo hồ sơ + (tuỳ chọn) mời tài khoản qua invite flow sẵn (gán orgId + role EMPLOYEE). Sync: User bị ban → Employee không đổi; Employee TERMINATED → revoke sessions + disable user.
- API: CRUD employee (search/filter theo department/position/status, cursor pagination), upload avatar + tài liệu hợp đồng (StorageProvider, signed URL), org chart đơn giản (cây theo manager).
- FE: `/dashboard/employees` (**AG Grid** Infinite Row Model nối cursor pagination + filter + detail drawer: thông tin, hợp đồng, tài liệu), form tạo/sửa (RHF + shared schema).
- **Acceptance:** e2e CRUD + phân quyền (`employee:read` thấy, EMPLOYEE thường chỉ thấy hồ sơ mình qua `/employees/me`).

### Phase 3 — Shifts, lịch & ngày lễ
- Model WorkShift/ShiftAssignment/HolidayCalendar/Holiday + API CRUD + gán ca (cá nhân hoặc **cả OrgUnit subtree**, có effectiveFrom). Calendar/shift mặc định gán được theo OrgUnit, resolve kế thừa leo cây per 2.10. Helper domain quan trọng: `resolveShift(employeeId, date)` và `isWorkingDay(orgId, orgUnitId, date)` — viết test đơn vị cho 2 hàm này (đổi ca giữa kỳ, ngày lễ nửa ngày, cuối tuần theo workDays, override calendar theo unit con).
- FE: `/dashboard/settings/shifts`, gán ca trong trang employee, trang lịch lễ.
- **Acceptance:** unit tests resolveShift/isWorkingDay pass đủ case trên.

### Phase 4 — Attendance core + Timesheet engine
- Migration SQL partition AttendanceLog (2.9). Model TimesheetDay, AttendanceCorrection.
- API: `POST /attendance/check` (WEB source — chưa cần face/location, dùng để test engine), `GET /attendance/me?from&to`, HR: `GET /attendance?employeeId&from&to` (+`attendance:read_all`), sửa công thủ công (`attendance:correct`, qua Approval ở Phase 8 — tạm thời direct + audit diff).
- Queue `timesheet-recalc` (2.7) + trigger đủ chỗ. Cron tạo partition tháng kế + cron 00:30 đánh ABSENT cho ngày hôm trước (employee có ca, không log, không phép).
- FE: `/dashboard/attendance` — view tháng dạng lưới **AG Grid** (employee × ngày, cell màu theo status, pin cột tên) + detail ngày; trang `/checkin` đơn giản (nút check-in/out, hiện log hôm nay).
- **Acceptance:** e2e — check-in/out → TimesheetDay đúng status LATE khi vào trễ quá grace; nghỉ lễ → HOLIDAY; không log → cron đánh ABSENT.

### Phase 5 — Face + Location check-in
- Cài `@vladmandic/human` (API) + setup model files; `FaceService`: `extractEmbedding(buffer)` (validate quality + antispoof), `verify(employeeId, buffer)` per 2.2.
- API: `POST /face/enroll` (multipart 3–5 ảnh, permission `face:enroll` — self hoặc HR), `DELETE /face/:employeeId` (`face:manage`), `POST /attendance/check` mở rộng: nhận ảnh (multipart) + coords; worksite require gì validate nấy; lưu photoKey + faceScore + locationSuspect.
- FE `/checkin` (PWA-ready: manifest + camera): bước 1 lấy GPS (hiện khoảng cách tới worksite), bước 2 mở camera selfie chụp → gửi; kết quả realtime (giờ, trạng thái sớm/trễ). Trang profile: enroll khuôn mặt (chụp 3–5 kiểu, preview, gửi).
- HR đối soát: trong detail ngày công hiện ảnh check-in (signed URL) + cờ nghi vấn.
- **Acceptance:** e2e với 2 ảnh fixture (cùng người → pass ≥ threshold, khác người → fail); check-in ngoài bán kính → `ERROR_CODES.OUT_OF_WORKSITE`.

### Phase 6 — Tích hợp máy vân tay (iclock/ADMS)
- Controller `/iclock/*` per 2.4 (text/plain, `@SkipAudit`, throttle riêng) + queue `attendance-ingest` + dedupe + UnmatchedDeviceLog.
- API quản trị: CRUD device (`device:manage`), map deviceCode↔employee (bulk), bảng log chưa khớp + nút map.
- FE: `/dashboard/settings/devices` (danh sách máy, lastSeenAt online/offline > 10 phút, log chưa khớp).
- Script `scripts/simulate-device.sh` (curl giả lập máy push ATTLOG) phục vụ test + demo.
- **Acceptance:** chạy simulate → log vào đúng employee, đẩy recalc timesheet; push trùng → không duplicate; SN lạ → bị từ chối.

### Phase 7 — Leave management
- Models + policy engine + ledger per 2.6. Cron accrual (idempotent) + cron expiry carry-over qua BullMQ.
- API: CRUD LeaveType/LeavePolicy (`leave:manage_policy`); `GET /leave/balance/me` (+per employee cho HR) trả breakdown (tổng, đã dùng, pending, carry-over sắp hết hạn); `POST /leave/requests` (validate trùng đơn, đủ số dư khả dụng, tính totalDays theo lịch); cancel; HR điều chỉnh số dư (ADJUSTMENT + lý do, audit).
- Tích hợp timesheet: ngày được approve → recalc → ON_LEAVE/HALF_LEAVE.
- FE: `/dashboard/leave` (số dư dạng cards + lịch sử ledger, form tạo đơn, danh sách đơn của tôi), HR: cấu hình policy + bảng số dư toàn org.
- **Acceptance:** unit test policy engine (pro-rata vào tháng 7 → 6/12 quota; carry-over quá max bị cắt; seniority bonus; monthly accrual đủ 12 bút toán); e2e tạo đơn vượt số dư → fail đúng mã lỗi.

### Phase 8 — Approval engine N cấp + Notification center (socket + FCM + email)
- Models per 2.8 + **resolver service** (DIRECT_MANAGER / MANAGEMENT_CHAIN / UNIT_MANAGER_OF_TYPE leo materialized path / ROLE / SPECIFIC_USER) + chọn flow theo priority+conditions + auto-skip + snapshot. Tích hợp: LeaveRequest, AttendanceCorrection, OTRequest (tối giản: date, from, to, reason). Duyệt sai lượt/sai người → 403; `approval:manage_flow` cấu hình flow.
- **Notification center per 2.11:** StorageModule-style `PushProvider` (firebase-admin, optional theo env), `DeviceToken` + `Notification` models, queue `notification` fan-out 3 kênh, API tokens + list + mark-read. Job nhắc SLA quá hạn duyệt (cron quét instance PENDING quá slaHours).
- FE: `/dashboard/approvals` (tab "Chờ tôi duyệt" / "Đơn của tôi", approve/reject + note, hiện chain các bước + ai đã duyệt, realtime); settings cấu hình flow (builder: thêm bước, chọn approverType, điều kiện, SLA); **chuông notification** header (badge, dropdown, mark-read) + đăng ký FCM token sau login + `firebase-messaging-sw.js` nhận push khi tab đóng.
- **Acceptance:** e2e — flow 3 cấp theo cây tập đoàn (DIRECT_MANAGER → UNIT_MANAGER_OF_TYPE(NHA_MAY) → ROLE HR): duyệt tuần tự đủ 3 cấp → ledger trừ + timesheet recalc; đơn ≤ 3 ngày match flow 1 cấp (conditions + priority đúng); reject giữa chừng → không trừ; requester là manager → step auto-skip; bảng Notification ghi đủ cho requester/approver mỗi chuyển trạng thái (FCM mock — không cần Firebase thật trong test).

### Phase 9 — Dashboard & Reports
- API thống kê (cache Redis 5 phút): hôm nay (đi làm/trễ/vắng/nghỉ phép, % checkin), xu hướng tháng, top trễ, headcount theo phòng ban; báo cáo bảng công tháng (employee × ngày) + **export XLSX** (`exceljs`, generate qua BullMQ + lưu storage + signed URL — không block request) và CSV.
- FE: `/dashboard` org overview (cards số liệu dùng `<CountUp>` animejs + charts `recharts`, vào trang stagger nhẹ bằng motion primitives), `/dashboard/reports` (chọn tháng/đơn vị → preview AG Grid + nút export, nhận file realtime khi job xong qua socket `report:ready`).
- **Acceptance:** export tháng của org 50 nhân viên ra XLSX mở được, số liệu khớp TimesheetDay.

### Phase 10 — Hardening, perf & nghiệm thu
- Seed script demo: 2 orgs, 60 nhân viên, 2 ca, 1 máy ảo, 3 tháng AttendanceLog + leave data (chạy được trong CI).
- Perf: `EXPLAIN` các query nóng (timesheet tháng, balance, audit) → bổ sung index thiếu; k6 hoặc autocannon smoke 100 req/s vào `GET /attendance/me` + `POST /attendance/check` (ghi kết quả vào README).
- Bảo mật rà lại: mọi route mới có RequirePermissions/Public tường minh, mọi query có orgId, signed URL có TTL, iclock chỉ nhận SN đăng ký.
- Cập nhật: README (kiến trúc HRM, env mới, hướng dẫn nối máy ZKTeco thật), CLAUDE.md (module map mới), CI (thêm model face cache nếu cần).
- **Checklist nghiệm thu cuối** — tự chạy từng mục:
  - [ ] Phase 0 checklist nền vẫn pass toàn bộ
  - [ ] Org A không đọc/ghi được bất kỳ resource nào của org B (test tự động)
  - [ ] Check-in mặt: đúng người pass, ảnh người khác fail, ngoài geofence fail
  - [ ] Simulate máy vân tay → công lên đúng, không trùng
  - [ ] Quota phép: pro-rata + carry-over + expiry đúng qua unit tests
  - [ ] Flow duyệt 2 cấp end-to-end realtime
  - [ ] Export XLSX bảng công khớp dữ liệu
  - [ ] Lighthouse Performance ≥ 90 cho `/` và `/dashboard` (production build); guardrails animation mục 2.12 được tuân thủ (animejs lazy-import, LazyMotion, không animate per-row)
  - [ ] `pnpm typecheck && pnpm lint && pnpm test && test:e2e` pass toàn repo
  - [ ] `docker compose -f docker-compose.prod.yml build` thành công

## 5. Env bổ sung (thêm vào .env.example ngay phase dùng đến)

```
# Storage (S3-compatible — dev dùng MinIO trong docker-compose)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=hrm
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio_secret
S3_FORCE_PATH_STYLE=true

# Face
FACE_MATCH_THRESHOLD=0.55
FACE_ANTISPOOF_THRESHOLD=0.5
FACE_MODELS_PATH=./models

# Firebase Cloud Messaging — optional, bỏ trống thì skip push (vẫn có socket + email)
# Đường dẫn file service account JSON, hoặc chuỗi base64 của file đó
FIREBASE_SERVICE_ACCOUNT=

# FE (apps/web) — Firebase web config cho nhận push
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
```
