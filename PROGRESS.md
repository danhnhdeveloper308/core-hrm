# HRM — Tiến độ & bàn giao (đọc trước khi code)

> Mục đích: phiên Claude mới đọc file này + `CLAUDE.md` là nắm được hiện trạng, **không cần đọc toàn bộ code**. Cập nhật file này mỗi khi hoàn thành một mảng lớn.

Stack: NestJS 11 (`apps/api`) + Next.js 16 App Router (`apps/web`) + `@repo/shared` (zod là source of truth). Prisma 7 + Postgres, BullMQ + Redis, MinIO/S3 storage, Socket.IO, EventEmitter2. Chạy migrate: `printf 'y\n' | script -qec "sg docker -c 'pnpm db:migrate <ten>'" /dev/null` rồi `sg docker -c "pnpm --filter api exec prisma generate"`. Gate: `pnpm typecheck`, `pnpm lint`, `pnpm --filter api test` (54 unit), e2e: `cd apps/api && NODE_ENV=test pnpm exec jest --config test/jest-e2e.json --forceExit` (60 tests).

## ĐÃ XONG (Phase 0–8 phần lớn)

- **Phase 0–5**: auth (JWT cookie + refresh rotation + 2FA + recovery), RBAC (`resource:action`, `@RequirePermissions`), tổ chức (OrgUnit cây + materialized path, code unique theo cha), nhân viên, chấm công + bảng công (engine `apps/api/src/modules/attendance/timesheet.engine.ts` — clamp công vào [giờ ca, giờ tan]: `workStart=max(checkin,shiftStart)`, `workEnd=min(checkout,shiftEnd)`; firstIn/lastOut lưu giờ thực tế), face check-in (@vladmandic/human).
- **Phase 7 Nghỉ phép**: LeaveType (`requiresDocument` = cần giấy tờ), LeavePolicy (kế thừa theo cây), ledger (`LeaveBalanceEntry`, balance = SUM). Phép **không lương** → bỏ policy, không giới hạn, không trừ số dư. FE: `/dashboard/leave`, cấu hình `/dashboard/settings/leave`.
- **Phase 8 Approval engine N cấp** (`apps/api/src/modules/approval/`): `ApprovalFlow` + `ApprovalFlowStep` (5+1 approver type: DIRECT_MANAGER, MANAGEMENT_CHAIN(level), UNIT_MANAGER_OF_TYPE(theo loại đv, leo cây), **UNIT_MANAGER_OF_UNIT(chọn đúng 1 đv)**, ROLE, SPECIFIC_USER; mỗi step có `label` nhãn chữ ký + `slaHours` (thời hạn duyệt — MỚI CHỈ hiển thị, chưa nhắc/escalation; escalation để Phase 8 Notification)). Chọn flow theo priority + conditions JSON. Resolve approver snapshot tại submit, auto-skip bước rỗng/ra chính requester, OR trong 1 bước, HR override (`OVERRIDE_PERM`). `ApprovalInstance.summary` để inbox hiển thị nội dung mọi loại. Sự kiện `APPROVAL_DECIDED` (emitAsync, các module đích lắng nghe — leave/attendance-correction/OT/shift-batch). FE: `/dashboard/approvals` (inbox / đã xử lý / đơn của tôi), builder `/dashboard/settings/approval-flows`.
- **Đính kèm** (`apps/api/src/modules/attachment/`): model `Attachment` đa hình (targetType LEAVE_REQUEST/ATTENDANCE_CORRECTION/OT_REQUEST), ảnh/PDF ≤10MB qua StorageService, signed URL. FE component `AttachmentPicker`/`AttachmentList`.
- **Auth/User (1 cài đặt = 1 công ty)**: `User.email` nullable + `User.username` unique (=mã NV). Tạo employee LUÔN tạo user: có email → invite; không email → username + mật khẩu mặc định `Abcd123@`. Login bằng email HOẶC mã NV. Phone bắt buộc. Quên MK fallback: `POST /auth/reset-password-by-identity` (mã NV + SĐT). Xem memory `hrm-login-model`.
- **Điều chỉnh công**: `POST /attendance/corrections/request` → duyệt → áp log MANUAL + recalc. `GET /attendance/corrections/mine`.
- **OT cá nhân (phần mềm tự log)**: `OtRequest` (OVERTIME | SHIFT_SHIFT), `POST /attendance/ot/request` → duyệt → cộng otMinutes / dời giờ. FE ở `/dashboard/my-attendance`.
- **Phiếu tăng/giãn ca theo DANH SÁCH (nhà máy)**: `apps/api/src/modules/shift-registration/`. Upload Excel (exceljs, danh sách phẳng MSNV+ngày+loại+lý do) → `ShiftRegistrationBatch`+lines → luồng duyệt `SHIFT_BATCH` (chữ ký N cấp, nhãn cấu hình, cao nhất sát trái / Tổng hợp=người upload sát phải) → cấp cao nhất duyệt → `TimesheetService.applyShiftVariant` áp cho TẤT CẢ theo `OtCalcMode`. WorkShift có `gianCaEnd`/`tangCaEnd` + `otCalcMode` (override org). FE `/dashboard/shift-registrations` (tải mẫu, upload, danh sách, chi tiết + thống kê + chữ ký). Xem memory `hrm-timekeeping-flexibility`.
- **Tính công 2 chế độ** (`OtCalcMode`, org default + ca override): `CLAMP_TO_REGISTERED` (sản xuất — nới khung [giờ ca, mốc đăng ký], clamp); `SEPARATE_OT` (phần mềm — cộng otMinutes riêng).

### Roles (5) & visibility
- ORG_ROLES: ORG_ADMIN, HR_MANAGER, UNIT_MANAGER, **EMPLOYEE** (nhân viên văn phòng), **WORKER** (công nhân — cấp thấp nhất). Tạo employee KHÔNG email → mặc định role **WORKER** (`users.createEmployeeAccount`, fallback EMPLOYEE nếu org chưa seed WORKER); mời qua email → EMPLOYEE.
- Permission `SHIFT_REGISTRATION_MANAGE` (`shift_registration:manage`): có ở ORG_ADMIN/HR/UNIT_MANAGER/**EMPLOYEE**, KHÔNG có ở WORKER. Gate trang + endpoint `/shift-registrations` + nav. → EMPLOYEE trở lên xem/đăng ký phiếu + thống kê; WORKER không thấy.
- Thêm permission/role mới ⇒ phải `sg docker -c "pnpm db:seed"` (upsert Permission) + org mới tự seed qua `organizations.service` (ALL_ORG_ROLES). Org CŨ cần backfill role/permission.

### Approver "Quản lý đơn vị" + chainLevel
- UNIT_MANAGER_OF_TYPE (leo cây theo loại đv) và UNIT_MANAGER_OF_UNIT (chọn đúng 1 đv) đều nhận `chainLevel` tuỳ chọn: 1 = chính quản lý đơn vị, 2 = quản lý cấp trên của họ… (resolver `climbManager`). VD giám đốc TS1 = UNIT_MANAGER_OF_UNIT(TS1) chainLevel 1.

## CHƯA LÀM (roadmap còn lại)

1. **Phase 8 Notification center**: in-app socket + FCM push + email; `NotificationService.dispatch` + queue + model `DeviceToken`/`Notification`; FE chuông thông báo. Gắn escalation/nhắc SLA (`ApprovalFlowStep.slaHours`) vào đây.
2. **Phase 9 Dashboard & Reports**: thống kê + export XLSX (exceljs đã cài) qua BullMQ. Mẫu báo cáo nhà máy: tổng hợp theo đơn vị (LĐ có mặt / xuống ca / giãn ca / tăng ca) — xem ảnh user gửi.
3. **Phase 10 Hardening**: perf, checklist nghiệm thu.
4. **Phase 6 Máy vân tay ZKTeco/iclock** (LÀM CUỐI — sau khi user cài phần cứng): ingest log → `AttendanceService.createLog` (idempotent) → recalc.

## Quy ước quan trọng (đừng phá)
- zod schema ở `@repo/shared` là source of truth; DTO backend = `createZodDto`; build shared trước khi typecheck api (`pnpm --filter @repo/shared build`).
- Mọi mutation: `@RequirePermissions` + `@Audit`. Lỗi: `AppException` + `ERROR_CODES`.
- FE: fetch wrapper `apps/web/src/lib/api/client.ts` (không axios); form RHF + zodResolver pattern 3-generic khi schema có `.default()`/`.transform()`; query keys tập trung `lib/api/query-keys.ts`.
- Commit theo từng cụm, chạy gate trước khi báo xong. Migrate cần `sg docker` + regenerate prisma client.
