# HR Suite — Kế hoạch phát triển các module còn thiếu

> **Mục đích**: phiên Claude mới đọc `CLAUDE.md` + `PROGRESS.md` + file này là đủ để
> bắt tay làm 12 nhóm tính năng HR còn thiếu mà **không lệch khỏi kiến trúc hiện có**.
> File này mô tả **thiết kế dữ liệu + API + FE + tích hợp** cho từng module, thứ tự
> ưu tiên, và checklist chuẩn lặp lại. Cập nhật `PROGRESS.md` (không phải file này)
> sau mỗi lần hoàn thành một module.

Ngày lập: 2026-06-27. Hệ thống đang ở Phase 9. Các module dưới đây nối tiếp roadmap.

---


## 0. Nền tảng có sẵn — BẮT BUỘC tái dùng (đừng dựng lại)

| Hạ tầng | Vị trí | Dùng cho |
|---|---|---|
| **Approval engine N cấp** | `apps/api/src/modules/approval/` | Mọi luồng duyệt: chỉ cần thêm giá trị vào enum `ApprovalTargetType`, lắng nghe event `APPROVAL_DECIDED` để áp kết quả. |
| **Attachment đa hình** | `apps/api/src/modules/attachment/` + FE `AttachmentPicker`/`AttachmentList` | File hợp đồng, CV ứng viên, thư mời, chứng chỉ, tài liệu khoá học, phiếu lương PDF. Thêm giá trị `AttachmentTargetType`. |
| **Notification 3 kênh** | `apps/api/src/modules/notification/` (`NotificationService.dispatch`) | Nhắc hết hạn hợp đồng/chứng chỉ, lịch phỏng vấn, kết quả offer, chu kỳ review. Thêm giá trị `NotificationType` + prefs. |
| **Audit interceptor** | `@Audit('resource.action')` | Bắt buộc cho mọi mutation. |
| **RBAC** | `@RequirePermissions()` + `packages/shared/src/constants/permissions.ts` + roles.ts | Mỗi module thêm permission `resource:action`, seed + sync-roles. |
| **Reports/Excel** | `apps/api/src/modules/reports/` (exceljs) | Export dashboard/báo cáo. File lớn → BullMQ async. |
| **Storage S3** | `StorageService` (signed URL) | Mọi file. |
| **BullMQ queues** | `apps/api/src/queues/` | Job nặng: tính lương hàng loạt, export, gửi mail hàng loạt. |
| **Cron** | pattern `ApprovalSlaService` (`@Cron`) | Nhắc hết hạn hợp đồng/chứng chỉ, mở/đóng chu kỳ. |
| **zod source-of-truth** | `packages/shared/src/schemas/` | Mọi type/validate. DTO = `createZodDto`. **Build shared trước khi typecheck api.** |
| **FE patterns** | react-query + `query-keys.ts`, RHF + zodResolver, `PermissionGate`, motion primitives, `OrgUnitCascader` (mới) | Trang dashboard mới. |
| **Multi-tenant** | mọi model có `orgId`; platform admin `orgId=null` → 403 ở route org-scope | Mọi model mới PHẢI có `orgId` + index + filter theo tenant trong service. |
| **Soft-delete** | `deletedAt` (Employee/Organization) | Dữ liệu pháp lý (hợp đồng, phiếu lương, đánh giá) **KHÔNG hard-delete**. |

**Dữ liệu HR đã có sẵn để nối**: `Employee` (hồ sơ đầy đủ theo luật VN), `Dependent`
(giảm trừ gia cảnh — payroll dùng), `OrgUnit` (cây + materialized path), `Position`
(level), `Employee.managerId` + `OrgUnit.managerId` (org chart), `AttendanceLog` +
timesheet (payroll/OT dashboard), `LeaveRequest`/ledger (payroll trừ phép không lương),
`OtRequest` + `ShiftRegistrationBatch` (OT management).

---

## 1. Thứ tự ưu tiên (phases) + phụ thuộc

Sắp theo **giá trị/độ rủi ro/độ phụ thuộc**. Mỗi phase nên là ≥1 commit độc lập, có gate xanh.

| Phase | Module | Vì sao thứ tự này | Phụ thuộc |
|---|---|---|---|
| **P-A** | (1) Organization Chart · (8) Attendance Dashboard · (9) Overtime Management | Chỉ **đọc/visualize dữ liệu đã có**, ít model mới → nhanh, ít rủi ro, demo được ngay. Trùng "Phase 9 phần 2" trong PROGRESS. | Không. |
| **P-B** | (2) Contract Management | Model độc lập, nối Employee; là tiền đề lương (salary trong hợp đồng). | Employee. |
| **P-C** | (3) Manpower Request → (4) Job Requisition → (5) Candidate → (6) Interview → (7) Offer | Pipeline tuyển dụng (ATS) — thiết kế **chung 1 cụm** vì liên kết chặt; Offer chấp nhận → tạo Employee (+Contract). | Approval engine; Employee.create; (P-B nếu auto tạo hợp đồng). |
| **P-D** | (10) Performance: KPI Setup · Goal Tracking · Performance Review · 360° Feedback · KPI Dashboard | Cụm lớn, độc lập tương đối. | Employee, OrgUnit, Approval (sign-off). |
| **P-E** | (11) Training: Catalog · Registration · Certification Tracking | Độc lập, vừa phải. | Employee, Attachment, Notification (nhắc hạn chứng chỉ). |
| **P-F** | (12) Payroll: Salary structure · Payroll run · Payslip · Benefits · Dashboard | **Làm cuối** — phức tạp & nhạy cảm pháp lý (PIT, BHXH/BHYT/BHTN, lương vùng), phụ thuộc nhiều nguồn. | Attendance, Leave, OT, Contract (lương), Dependent (giảm trừ). |

> Gợi ý: làm trọn từng phase, chạy `pnpm typecheck && pnpm lint && pnpm --filter api test`,
> e2e khi đụng luồng duyệt, rồi commit + cập nhật PROGRESS.md trước khi sang phase kế.

---

## 2. Checklist CHUẨN cho mỗi module (lặp lại y hệt)

1. **Shared (`packages/shared/src/schemas/<module>.ts`)**: zod schema (entity + create/update + query + response), infer type, export ở `index.ts`. Enum dùng `z.enum`.
2. **Permissions**: thêm vào `constants/permissions.ts` (`resource:action`) + mô tả + gán vào role mặc định ở `constants/roles.ts`. Quyền platform-only (nếu có) vào `PLATFORM_ONLY_PERMISSIONS`.
3. **Prisma**: thêm model (orgId + index `[orgId, ...]`, `createdAt/updatedAt`, FK `onDelete` hợp lý, soft-delete nếu pháp lý). Enum mới. Migration: `printf 'y\n' | script -qec "sg docker -c 'pnpm db:migrate <ten>'" /dev/null` rồi `sg docker -c "pnpm --filter api exec prisma generate"`.
4. **BE module** (`apps/api/src/modules/<name>/`): `*.module.ts`, controller (mỏng, `@ApiOperation`+`@ApiOkResponse`, `@RequirePermissions`, `@Audit` cho mutation), service (logic, ép `orgId` theo `@CurrentOrg()`/token, lỗi qua `AppException`+`ERROR_CODES`). DTO `createZodDto`. Đăng ký vào `app.module.ts`.
5. **Tích hợp**: cần duyệt → thêm `ApprovalTargetType` + tạo instance khi submit + handler `@OnEvent('APPROVAL_DECIDED')` áp kết quả. Cần file → `AttachmentTargetType`. Cần báo → `NotificationService.dispatch` (+`NotificationType`). Cần nhắc hạn → cron.
6. **Seed/sync**: `pnpm db:seed` (permission mới) + **org cũ**: `pnpm db:sync-roles` (backfill). User đang đăng nhập phải đăng nhập lại (cache permission).
7. **FE** (`apps/web/src/app/dashboard/<route>/`): server component mặc định, `'use client'` khi cần; react-query + key trong `query-keys.ts`; form RHF+zodResolver (pattern 3-generic khi schema có `.default()/.transform()`); `PermissionGate`; thêm mục **nav** trong `dashboard/layout.tsx` (gate permission); toast `sonner`.
8. **Gate**: `pnpm --filter @repo/shared build` → `pnpm typecheck` → `pnpm lint` → test. e2e cho luồng duyệt.
9. **Cập nhật `PROGRESS.md`** (mục "ĐÃ XONG" + ngày).

---

## 3. Permissions dự kiến thêm (tổng hợp)

```
orgchart:view
contract:read   contract:manage
recruitment:read   recruitment:manage   // manpower/req/candidate/interview chung
offer:manage
performance:read   performance:manage   goal:read   goal:manage   review:conduct
training:read   training:manage   training:enroll
payroll:read   payroll:manage   payslip:read_self
```
> Gộp hợp lý để tránh bùng nổ quyền: tuyển dụng dùng chung `recruitment:*`; chấm công
> dashboard/OT dùng lại `report:read`/`attendance:read_all` nếu đủ. Quyết định cuối khi code.

Enum mở rộng:
- `ApprovalTargetType` += `MANPOWER_REQUEST, OFFER, CONTRACT, PERFORMANCE_REVIEW, TRAINING_ENROLLMENT, PAYROLL_RUN`
- `AttachmentTargetType` += `CONTRACT, CANDIDATE, OFFER, TRAINING_COURSE, CERTIFICATION, PAYSLIP`
- `NotificationType` += `GENERAL` đã đủ cho nhiều case; cân nhắc `DEADLINE_REMINDER` cho hết hạn HĐ/chứng chỉ (kèm prefs).

---

## 4. Thiết kế từng module

> Ký hiệu: **M** = model Prisma, **EP** = endpoint chính, **FE** = trang, **∞** = tái dùng/tích hợp.

### P-A.1 — Organization Chart (sơ đồ tổ chức)
- **Không cần model mới.** Dữ liệu từ `OrgUnit` (cây) + `Employee.managerId`/`OrgUnit.managerId`.
- **EP**: `GET /reports/org-chart?rootUnitId=&mode=unit|people` → `{ nodes, edges }`.
  - `mode=unit`: node = đơn vị, edge = parent→child (đã có path); kèm `managerName`, headcount mỗi đơn vị.
  - `mode=people`: node = nhân viên, edge = manager→report (reporting line).
- **FE**: `/dashboard/org-chart` — chart tương tác. Lib: `@xyflow/react` (react-flow) cho zoom/pan/collapse, hoặc render cây CSS nhẹ (đệ quy) để khỏi thêm deps nặng → **ưu tiên CSS/SVG tự vẽ** + nút expand/collapse, fallback react-flow nếu cần kéo-thả. Export PNG/PDF optional.
- **∞**: permission `orgchart:view` (hoặc `org:read`). Lọc theo `orgId`. Có thể tái dùng `OrgUnitCascader` để chọn root.
- **Gotcha**: tránh render toàn bộ tập đoàn 1 lần (ngàn node) → lazy theo nhánh / virtualize.

### P-A.8 — Attendance Dashboard
- **Không cần model mới** (đọc timesheet/attendance). Mở rộng `GET /reports/dashboard` đã có.
- **EP**: `GET /reports/attendance-dashboard?from&to&orgUnitId` → time-series (đi làm/đi trễ/về sớm/vắng/nghỉ theo ngày) + breakdown theo đơn vị + top đi trễ. Tận dụng query timesheet sẵn có.
- **FE**: `/dashboard/attendance-dashboard` — KPI cards + biểu đồ (line/bar). Lib chart: **recharts** (nhẹ, React) — thêm 1 lần dùng chung cho cả KPI/payroll dashboard. Bộ lọc khoảng ngày + đơn vị (`OrgUnitCascader`).
- **∞**: `report:read`. Cùng nguồn với "Phase 9 phần 2".

### P-A.9 — Overtime Management
- Đã có `OtRequest` (cá nhân) + `ShiftRegistrationBatch` (danh sách nhà máy). Bổ sung **quản trị OT**:
- **M `OtPolicy`** (orgId, scope: org/đơn vị, `maxHoursPerMonth` mặc định 40, `maxHoursPerYear` 200/300, `requireApproval`). Tùy chọn — có thể hard-code caps luật VN trước.
- **EP**: `GET /overtime/summary?from&to&orgUnitId` (tổng giờ OT theo NV/đơn vị/tháng + cảnh báo vượt trần) · `GET /overtime/requests` (gộp OtRequest + lines từ shift-registration) · CRUD `OtPolicy`.
- **FE**: `/dashboard/overtime` — bảng tổng hợp giờ OT, badge "vượt trần", lọc kỳ/đơn vị; tab chính sách trần OT.
- **∞**: dùng dữ liệu OT có sẵn; cảnh báo trần (VN: ≤40h/tháng, ≤200h hoặc 300h/năm theo ngành). Permission `attendance:read_all` hoặc mới `overtime:manage`.

### P-B.2 — Contract Management (Hợp đồng lao động)
- **Enum `ContractType` đã có** (PROBATION/FIXED_TERM/INDEFINITE) → mở rộng: `SEASONAL, SERVICE, APPRENTICESHIP` nếu cần.
- **M `Contract`**: `orgId, employeeId, code(số HĐ, unique theo org), type, startDate, endDate(null=vô thời hạn), baseSalary, allowanceJson, status(DRAFT/ACTIVE/EXPIRING/EXPIRED/TERMINATED), signedDate, fileKey?(qua Attachment), parentId?(phụ lục/gia hạn), note, createdAt, updatedAt, deletedAt`.
- **M `ContractAddendum`** (tùy chọn) hoặc dùng `parentId` self-relation cho phụ lục.
- **EP**: CRUD `/contracts` (`?employeeId=`), `GET /employees/:id/contracts`, `POST /contracts/:id/terminate`.
- **Cron**: `ContractReminderService` — HĐ sắp hết hạn (30/15/7 ngày) → `NotificationService.dispatch` cho HR + quản lý; tự set `status=EXPIRING/EXPIRED`.
- **FE**: `/dashboard/contracts` (danh sách + lọc trạng thái/sắp hết hạn) + **tab "Hợp đồng" trong employee detail sheet**. Upload file HĐ qua `AttachmentPicker` (targetType `CONTRACT`).
- **∞**: lương trong HĐ là **nguồn cho Payroll**. Soft-delete (giữ pháp lý). Approval optional (`CONTRACT` targetType nếu cần duyệt ký).

### P-C — Recruitment / ATS (thiết kế chung 1 cụm: M3→M7)

Pipeline: **Manpower Request → (duyệt) → Job Requisition (đăng tuyển) → Candidate/Application → Interview → Offer → (chấp nhận) → tạo Employee (+Contract)**.

- **M3 `ManpowerRequest`** (Yêu cầu tuyển dụng): `orgId, orgUnitId, positionId, quantity, reason, neededBy, budgetSalary?, status(PENDING/APPROVED/REJECTED/FULFILLED/CANCELLED), requesterId`. → duyệt qua engine (`ApprovalTargetType=MANPOWER_REQUEST`). Approved mới mở được requisition.
- **M4 `JobRequisition`** (tin/đợt tuyển): `orgId, manpowerRequestId?, title, orgUnitId, positionId, headcount, descriptionRich, requirements, salaryFrom/To, employmentType, status(DRAFT/OPEN/ON_HOLD/CLOSED/FILLED), openedAt, closedAt, publicSlug?(career page)`. (Career page public **để sau** — optional.)
- **M5 `Candidate`** (`orgId, fullName, email, phone, source, resumeKey?(Attachment), tagsJson, note`) + **`Application`** (`orgId, candidateId, jobRequisitionId, stage(APPLIED/SCREENING/INTERVIEW/OFFER/HIRED/REJECTED), status, ratingAvg, rejectReason`). 1 candidate có nhiều application.
- **M6 `Interview`** (`orgId, applicationId, round(int), mode(ONSITE/ONLINE/PHONE), scheduledAt, durationMin, location/meetingLink, status(SCHEDULED/DONE/CANCELLED/NO_SHOW)`) + **`InterviewPanelist`** (interviewId, employeeId) + **`InterviewFeedback`** (interviewId, interviewerId(Employee), scoresJson, recommendation(HIRE/NO_HIRE/MAYBE), comment). → Notification mời panelist + nhắc lịch (cron).
- **M7 `Offer`** (`orgId, applicationId, position, baseSalary, allowanceJson, startDate, expiresAt, status(DRAFT/PENDING_APPROVAL/SENT/ACCEPTED/DECLINED/EXPIRED), letterKey?(Attachment)`). → duyệt (`OFFER`); chấp nhận → **service `convertOfferToEmployee`**: dùng lại `employees.create()` (tạo cả tài khoản) + optional `contracts.create()` + cập nhật `Application.stage=HIRED`, `JobRequisition.headcount`/status.
- **EP** (gộp module `recruitment/`): `/manpower-requests`, `/job-requisitions`, `/candidates`, `/applications` (+ `PATCH /applications/:id/stage` kéo kanban), `/interviews` (+ feedback), `/offers` (+ `/offers/:id/accept`).
- **FE**: `/dashboard/recruitment` với tab: Yêu cầu nhân sự · Tin tuyển dụng · Ứng viên (**Kanban theo stage**, dnd nhẹ) · Phỏng vấn (lịch + scorecard) · Offer. Upload CV/letter qua Attachment.
- **∞**: permission `recruitment:*` + `offer:manage`. Approval cho ManpowerRequest & Offer. Notification cho panelist/ứng viên (email). Audit mọi mutation.
- **Gotcha**: ứng viên **chưa phải User/Employee** → `InterviewFeedback.interviewerId` trỏ Employee, còn ratings của ứng viên không cần account. Chỉ tạo Employee khi **accept offer**.

### P-D.10 — Performance / KPI
- **M `ReviewCycle`** (`orgId, name, type(QUARTERLY/SEMI/ANNUAL/CUSTOM), periodStart/End, status(DRAFT/OPEN/CALIBRATING/CLOSED)`).
- **M `KpiDefinition`** (thư viện KPI: `orgId, name, category, unit, direction(HIGHER_BETTER/LOWER_BETTER), defaultWeight, description`).
- **M `Goal`** (OKR/MBO: `orgId, employeeId, cycleId, parentId?(cascade mục tiêu), title, kpiDefinitionId?, target, actual, weight, progress, status(DRAFT/ACTIVE/DONE/CANCELLED)`).
- **M `PerformanceReview`** (`orgId, employeeId, cycleId, reviewerId, selfScoreJson, managerScoreJson, finalScore, ratingLabel, status(SELF/MANAGER/CALIBRATION/DONE)`). Sign-off qua engine (`PERFORMANCE_REVIEW`).
- **M `Feedback360`** (`orgId, revieweeId, cycleId`) + **`Feedback360Rater`** (raterEmployeeId, relation(MANAGER/PEER/SUBORDINATE/SELF), responsesJson, submitted, **anonymous flag** — ẩn danh khi tổng hợp).
- **EP**: `/review-cycles`, `/kpi-definitions`, `/goals` (+ `/goals/:id/progress`), `/performance-reviews` (+ self/manager submit), `/feedback-360` (+ invite raters, submit).
- **FE**: `/dashboard/performance` tab: Chu kỳ · Mục tiêu (cá nhân + nhóm) · Đánh giá (form self/manager) · 360° · **KPI Dashboard** (điểm theo đơn vị/cá nhân, phân phối rating — recharts).
- **∞**: permission `performance:*`, `goal:*`, `review:conduct`. Approval sign-off. Notification mời rater/nhắc deadline. Audit.
- **Gotcha**: 360° **ẩn danh** → khi trả responses cho người xem, gộp/aggregate, không lộ rater. Quyền xem review giới hạn (NV xem của mình; quản lý xem cấp dưới; HR xem org).

### P-E.11 — Training
- **M `TrainingCourse`** (catalog: `orgId, title, category, mode(ONLINE/OFFLINE/EXTERNAL), provider, durationHours, cost, descriptionRich, materialKeys(Attachment), active`).
- **M `TrainingSession`** (lớp/đợt mở: `orgId, courseId, startAt, endAt, location/link, trainerEmployeeId?, capacity, status(OPEN/FULL/RUNNING/DONE/CANCELLED)`).
- **M `TrainingEnrollment`** (`orgId, sessionId, employeeId, status(REGISTERED/CONFIRMED/ATTENDED/COMPLETED/CANCELLED/NO_SHOW), score?, feedback?`). Đăng ký optional duyệt (`TRAINING_ENROLLMENT`).
- **M `Certification`** (`orgId, employeeId, name, issuer, issuedDate, expiryDate?, credentialId?, fileKey?(Attachment), trainingCourseId?`).
- **EP**: `/training/courses`, `/training/sessions`, `/training/enrollments` (+ self `POST /training/sessions/:id/register`, `/enrollments/:id/complete`), `/certifications` (+ `GET /employees/:id/certifications`).
- **Cron**: nhắc **chứng chỉ sắp hết hạn** (60/30/7 ngày) → Notification cho NV + HR.
- **FE**: `/dashboard/training` tab: Danh mục khoá · Lớp/Đăng ký (NV tự đăng ký, HR duyệt/điểm danh) · Chứng chỉ (+ tab trong employee detail). Upload tài liệu/chứng chỉ qua Attachment.
- **∞**: permission `training:*`. Notification. Approval optional. Audit.

### P-F.12 — Payroll (LÀM CUỐI — nhạy cảm pháp lý VN)
- **M `SalaryComponent`** (cấu phần lương: `orgId, code, name, kind(EARNING/DEDUCTION), taxable, formula?(hoặc fixed), order`).
- **M `EmployeeSalary`** (lương theo NV, **versioned theo effectiveDate**: `orgId, employeeId, baseSalary, componentsJson, effectiveDate`). Nguồn ưu tiên: Contract.baseSalary.
- **M `PayrollPeriod`/`PayrollRun`** (`orgId, month(YYYY-MM), status(DRAFT/CALCULATED/APPROVED/PAID/LOCKED), runAt, approvedBy`). Khoá kỳ sau khi PAID.
- **M `Payslip`** (`orgId, runId, employeeId, workdays, otMinutes, gross, pit, bhxh, bhyt, bhtn, otherDeductions, net, breakdownJson, fileKey?(PDF)`). **Soft/no-delete**.
- **M `BenefitPlan`** + **`EmployeeBenefit`** (phụ cấp/phúc lợi: bảo hiểm sức khoẻ, ăn trưa, điện thoại…): `orgId, name, kind, amount, taxable` + gán theo NV/đơn vị.
- **EP**: `/salary-components`, `/employee-salaries`, `/payroll/runs` (+ `POST /payroll/runs/:id/calculate` → **BullMQ** tính hàng loạt, `/approve`, `/pay`), `/payslips` (+ self `GET /payslips/mine`, export PDF), `/benefits`.
- **Tính lương (engine `PayrollEngine`)** kéo từ: timesheet (công thực tế, OT minutes), leave (trừ phép **không lương**), Contract/EmployeeSalary (lương + phụ cấp), `Dependent` (giảm trừ gia cảnh PIT), BenefitPlan.
  - **VN rules**: BHXH 8% / BHYT 1.5% / BHTN 1% (phần NV) trên lương đóng BH (trần 20× lương cơ sở / 20× lương tối thiểu vùng cho BHTN); PIT **luỹ tiến từng phần** (7 bậc) sau giảm trừ bản thân (11tr) + người phụ thuộc (4.4tr/người). Tham số hoá vào bảng cấu hình (`PayrollConfig`) để chỉnh khi luật đổi — **không hard-code rải rác**.
- **FE**: `/dashboard/payroll` tab: Dashboard (tổng quỹ lương, biểu đồ) · Kỳ lương (tạo/tính/duyệt/chốt) · Bảng lương (payslip theo NV) · Cấu phần & phúc lợi. NV xem payslip của mình ở `/dashboard/my-payslips` (permission `payslip:read_self`). Export PDF/Excel.
- **∞**: permission `payroll:*`, `payslip:read_self`. Approval `PAYROLL_RUN`. Audit nghiêm ngặt (tiền). BullMQ cho tính/EXPORT. Soft-delete tuyệt đối.
- **Gotcha**: tách **PayrollConfig** (thuế/BH/lương vùng) ra cấu hình; versioned salary; idempotent khi tính lại 1 kỳ (xoá payslip DRAFT cũ → tính lại); khoá kỳ đã PAID; số tiền dùng integer (VND, không float).

---

## 5. Rủi ro & nguyên tắc xuyên suốt
- **Multi-tenant**: mọi query lọc `orgId`; không bao giờ trust orgId từ client (lấy từ token/`@CurrentOrg`).
- **Tiền & pháp lý** (Contract/Payroll): integer VND, soft-delete, audit đầy đủ, tham số luật tách cấu hình.
- **Approval**: không tự viết luồng duyệt mới — luôn dùng engine + `APPROVAL_DECIDED`.
- **Hiệu năng**: org chart/payroll hàng loạt → phân trang/virtualize/BullMQ; tránh N+1 (Prisma `include` có chọn lọc).
- **Quyền xem dữ liệu nhạy cảm**: lương/đánh giá/360° → scope chặt (self / cấp dưới / HR org).
- **Migration**: partial-unique/SQL đặc biệt phải chèn tay vào file migration (Prisma không diễn đạt được) — xem tiền lệ `20260625023120_*`.
- **Org cũ**: thêm permission/role ⇒ `pnpm db:sync-roles` + user đăng nhập lại.

---

## 6. Bắt đầu nhanh cho phiên mới
1. Đọc `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `PROGRESS.md`, file này.
2. Chọn **một phase** (mặc định bắt đầu **P-A**). Theo **§2 checklist** đúng thứ tự.
3. Tôn trọng **§0 tái dùng** — đừng dựng lại approval/attachment/notification/audit/report.
4. Gate xanh + cập nhật `PROGRESS.md` + commit theo cụm (author `danhnhdeveloper308`, **không gán Claude**).
