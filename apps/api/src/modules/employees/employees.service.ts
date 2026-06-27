import { HttpStatus, Injectable } from '@nestjs/common';
import {
  createEmployeeSchema,
  ERROR_CODES,
  ORG_ROLES,
  type ContractResponse,
  type CreateContractInput,
  type CreateDependentInput,
  type CreateEmployeeInput,
  type CursorPaginated,
  type DependentResponse,
  type EmployeeDetailResponse,
  type EmployeeResponse,
  type ImportEmployeesResult,
  type ListEmployeesQuery,
  type UpdateDependentInput,
  type UpdateEmployeeInput,
} from '@repo/shared';
import ExcelJS from 'exceljs';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Dependent, EmploymentContract } from '../../prisma/prisma.types';
import { StorageService } from '../../storage/storage.service';
import { OrgUnitsService } from '../org-structure/org-units.service';
import { PermissionsCacheService } from '../rbac/permissions-cache.service';
import { SessionsService } from '../sessions/sessions.service';
import { UsersService } from '../users/users.service';

const EMPLOYEE_INCLUDE = {
  user: { select: { email: true } },
  orgUnit: { select: { name: true } },
  position: { select: { name: true } },
  manager: { select: { fullName: true } },
  worksite: { select: { name: true } },
} as const;

type EmployeeWithRelations = Prisma.EmployeeGetPayload<{
  include: typeof EMPLOYEE_INCLUDE;
}>;

function dateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Cột template import nhân viên (theo THỨ TỰ cố định — file mẫu sinh theo đây,
 * khi đọc cũng map theo vị trí cột). `key` trùng field input để build object.
 */
const IMPORT_COLUMNS: {
  header: string;
  key: string;
  width: number;
  example: string;
}[] = [
  { header: 'Mã NV (*)', key: 'code', width: 14, example: 'NV-001' },
  { header: 'Họ tên (*)', key: 'fullName', width: 24, example: 'Nguyễn Văn A' },
  { header: 'Số điện thoại (*)', key: 'phone', width: 16, example: '0901234567' },
  { header: 'Ngày vào làm (*) YYYY-MM-DD', key: 'joinDate', width: 22, example: '2025-01-15' },
  { header: 'Ngày sinh (YYYY-MM-DD)', key: 'dob', width: 20, example: '1995-05-20' },
  { header: 'Giới tính (Nam/Nữ/Khác)', key: 'gender', width: 18, example: 'Nam' },
  { header: 'Email mời tài khoản', key: 'inviteEmail', width: 24, example: 'a.nguyen@congty.vn' },
  { header: 'Email cá nhân', key: 'personalEmail', width: 24, example: '' },
  { header: 'Đơn vị (tên)', key: 'orgUnitName', width: 20, example: 'Phòng Nhân sự' },
  { header: 'Chức danh (tên)', key: 'positionName', width: 20, example: 'Nhân viên' },
  { header: 'Địa điểm (tên)', key: 'worksiteName', width: 20, example: 'Trụ sở chính' },
  { header: 'Số CCCD/CMND', key: 'idNumber', width: 18, example: '' },
  { header: 'Ngày cấp CCCD (YYYY-MM-DD)', key: 'idIssuedDate', width: 22, example: '' },
  { header: 'Nơi cấp CCCD', key: 'idIssuedPlace', width: 22, example: '' },
  { header: 'Mã số thuế', key: 'taxCode', width: 16, example: '' },
  { header: 'Số sổ BHXH', key: 'socialInsuranceNo', width: 16, example: '' },
  { header: 'Số thẻ BHYT', key: 'healthInsuranceNo', width: 18, example: '' },
  { header: 'Số tài khoản NH', key: 'bankAccountNo', width: 18, example: '' },
  { header: 'Ngân hàng', key: 'bankName', width: 18, example: '' },
  { header: 'Chi nhánh NH', key: 'bankBranch', width: 18, example: '' },
  { header: 'Địa chỉ thường trú', key: 'permanentAddress', width: 28, example: '' },
  { header: 'Địa chỉ tạm trú', key: 'currentAddress', width: 28, example: '' },
  { header: 'Liên hệ khẩn cấp - Họ tên', key: 'emergencyContactName', width: 22, example: '' },
  { header: 'Liên hệ khẩn cấp - SĐT', key: 'emergencyContactPhone', width: 20, example: '' },
  { header: 'Liên hệ khẩn cấp - Quan hệ', key: 'emergencyContactRelation', width: 22, example: '' },
  { header: 'Tình trạng hôn nhân', key: 'maritalStatus', width: 20, example: '' },
  { header: 'Dân tộc', key: 'ethnicity', width: 14, example: 'Kinh' },
  { header: 'Quốc tịch', key: 'nationality', width: 14, example: 'Việt Nam' },
  { header: 'Tôn giáo', key: 'religion', width: 14, example: '' },
  { header: 'Trình độ', key: 'educationLevel', width: 16, example: '' },
  { header: 'Chuyên ngành', key: 'major', width: 18, example: '' },
];

const SHEET_NAME = 'Nhân viên';

const GENDER_MAP: Record<string, string> = {
  nam: 'MALE',
  male: 'MALE',
  m: 'MALE',
  nữ: 'FEMALE',
  nu: 'FEMALE',
  female: 'FEMALE',
  f: 'FEMALE',
  khác: 'OTHER',
  khac: 'OTHER',
  other: 'OTHER',
};

const MARITAL_MAP: Record<string, string> = {
  'độc thân': 'SINGLE',
  'doc than': 'SINGLE',
  single: 'SINGLE',
  'đã kết hôn': 'MARRIED',
  'da ket hon': 'MARRIED',
  'kết hôn': 'MARRIED',
  married: 'MARRIED',
  'ly hôn': 'DIVORCED',
  'ly hon': 'DIVORCED',
  divorced: 'DIVORCED',
  goá: 'WIDOWED',
  goa: 'WIDOWED',
  'góa': 'WIDOWED',
  widowed: 'WIDOWED',
};

/** Giá trị 1 ô Excel → chuỗi đã trim (xử lý Date / rich-text / formula). */
function cellToString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('text' in value && value.text != null) return String(value.text).trim() || null;
    if ('result' in value && value.result != null) {
      return String(value.result).trim() || null;
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text).join('').trim() || null;
    }
    if ('hyperlink' in value && 'text' in value) {
      return String(value.text).trim() || null;
    }
    return null;
  }
  return String(value).trim() || null;
}

/** Chuẩn hoá ô ngày → "YYYY-MM-DD" (Date hoặc chuỗi). null nếu rỗng. */
function cellToDateOnly(value: ExcelJS.CellValue): string | null {
  const s = cellToString(value);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy hoặc dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  return s; // để zod báo lỗi định dạng nếu sai
}

function toContractResponse(c: EmploymentContract): ContractResponse {
  return {
    id: c.id,
    employeeId: c.employeeId,
    type: c.type,
    startDate: dateOnly(c.startDate) ?? '',
    endDate: dateOnly(c.endDate),
    hasFile: c.fileKey !== null,
    note: c.note,
    createdAt: c.createdAt.toISOString(),
  };
}

function toDependentResponse(d: Dependent): DependentResponse {
  return {
    id: d.id,
    fullName: d.fullName,
    relationship: d.relationship,
    dob: dateOnly(d.dob),
    taxCode: d.taxCode,
    note: d.note,
  };
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly permsCache: PermissionsCacheService,
    private readonly orgUnits: OrgUnitsService,
  ) {}

  private async toResponse(
    e: EmployeeWithRelations,
    opts?: { signAvatar?: boolean },
  ): Promise<EmployeeResponse> {
    return {
      id: e.id,
      userId: e.userId,
      userEmail: e.user?.email ?? null,
      code: e.code,
      fullName: e.fullName,
      dob: dateOnly(e.dob),
      gender: e.gender,
      phone: e.phone,
      orgUnitId: e.orgUnitId,
      orgUnitName: e.orgUnit?.name ?? null,
      positionId: e.positionId,
      positionName: e.position?.name ?? null,
      managerId: e.managerId,
      managerName: e.manager?.fullName ?? null,
      worksiteId: e.worksiteId,
      worksiteName: e.worksite?.name ?? null,
      joinDate: dateOnly(e.joinDate) ?? '',
      leaveDate: dateOnly(e.leaveDate),
      status: e.status,
      avatarUrl:
        opts?.signAvatar && e.avatarKey
          ? await this.storage.getSignedUrl(e.avatarKey, 3600)
          : null,
      personalEmail: e.personalEmail,
      idNumber: e.idNumber,
      idIssuedDate: dateOnly(e.idIssuedDate),
      idIssuedPlace: e.idIssuedPlace,
      taxCode: e.taxCode,
      socialInsuranceNo: e.socialInsuranceNo,
      healthInsuranceNo: e.healthInsuranceNo,
      bankAccountNo: e.bankAccountNo,
      bankName: e.bankName,
      bankBranch: e.bankBranch,
      permanentAddress: e.permanentAddress,
      currentAddress: e.currentAddress,
      emergencyContactName: e.emergencyContactName,
      emergencyContactPhone: e.emergencyContactPhone,
      emergencyContactRelation: e.emergencyContactRelation,
      maritalStatus: e.maritalStatus,
      ethnicity: e.ethnicity,
      nationality: e.nationality,
      religion: e.religion,
      educationLevel: e.educationLevel,
      major: e.major,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  /** Map field hồ sơ (VN) từ input → Prisma data (chỉ field được truyền). */
  private profileData(
    input: Partial<UpdateEmployeeInput>,
  ): Record<string, string | Date | null> {
    const d: Record<string, string | Date | null> = {};
    const set = (k: keyof typeof input) => {
      const v = input[k];
      if (v !== undefined) d[k as string] = (v as string | null) ?? null;
    };
    if (input.idIssuedDate !== undefined) {
      d.idIssuedDate = input.idIssuedDate ? new Date(input.idIssuedDate) : null;
    }
    set('personalEmail');
    set('idNumber');
    set('idIssuedPlace');
    set('taxCode');
    set('socialInsuranceNo');
    set('healthInsuranceNo');
    set('bankAccountNo');
    set('bankName');
    set('bankBranch');
    set('permanentAddress');
    set('currentAddress');
    set('emergencyContactName');
    set('emergencyContactPhone');
    set('emergencyContactRelation');
    set('maritalStatus');
    set('ethnicity');
    set('nationality');
    set('religion');
    set('educationLevel');
    set('major');
    return d;
  }

  /**
   * Scope dữ liệu: ORG_ADMIN/HR_MANAGER thấy toàn org (null);
   * còn lại giới hạn subtree các unit mình quản lý + hồ sơ chính mình.
   */
  async resolveScopePaths(actor: AccessTokenPayload): Promise<string[] | null> {
    if (!actor.orgId) return null;
    const orgWide = await this.prisma.userRole.count({
      where: {
        userId: actor.sub,
        role: {
          orgId: actor.orgId,
          name: { in: [ORG_ROLES.ORG_ADMIN, ORG_ROLES.HR_MANAGER] },
        },
      },
    });
    if (orgWide > 0) return null;
    return this.orgUnits.getManagedSubtreePaths(actor.orgId, actor.sub);
  }

  /** Điều kiện Prisma cho scope subtree (kèm hồ sơ của chính actor). */
  private scopeWhere(
    scopePaths: string[] | null,
    actorUserId: string,
  ): Prisma.EmployeeWhereInput {
    if (scopePaths === null) return {};
    return {
      OR: [
        ...scopePaths.map((p) => ({
          orgUnit: { is: { path: { startsWith: p } } },
        })),
        { userId: actorUserId },
      ],
    };
  }

  async list(
    orgId: string,
    actor: AccessTokenPayload,
    query: ListEmployeesQuery,
  ): Promise<CursorPaginated<EmployeeResponse>> {
    const scopePaths = await this.resolveScopePaths(actor);
    const where: Prisma.EmployeeWhereInput = {
      orgId,
      deletedAt: null,
      ...this.scopeWhere(scopePaths, actor.sub),
      ...(query.status ? { status: query.status } : {}),
      ...(query.positionId ? { positionId: query.positionId } : {}),
      ...(query.orgUnitId ? { orgUnitId: query.orgUnitId } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.employee.findMany({
      where,
      include: EMPLOYEE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: await Promise.all(items.map((e) => this.toResponse(e))),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async create(
    orgId: string,
    actor: AccessTokenPayload,
    input: CreateEmployeeInput,
  ): Promise<EmployeeResponse> {
    const codeTaken = await this.prisma.employee.findFirst({
      where: { orgId, code: input.code, deletedAt: null },
    });
    if (codeTaken) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Mã nhân viên "${input.code}" đã tồn tại`,
        ERROR_CODES.ORG_CODE_TAKEN,
      );
    }
    await this.validateRefs(orgId, input);

    const employee = await this.prisma.employee.create({
      data: {
        orgId,
        code: input.code,
        fullName: input.fullName,
        dob: input.dob ? new Date(input.dob) : null,
        gender: input.gender ?? null,
        phone: input.phone ?? null,
        orgUnitId: input.orgUnitId ?? null,
        positionId: input.positionId ?? null,
        managerId: input.managerId ?? null,
        worksiteId: input.worksiteId ?? null,
        joinDate: new Date(input.joinDate),
        status: input.status,
        ...this.profileData(input),
      },
      include: EMPLOYEE_INCLUDE,
    });

    // LUÔN tạo tài khoản đăng nhập: có email → invite (đặt mật khẩu qua link);
    // không email → tài khoản username (= mã NV) + mật khẩu mặc định Abcd123@.
    const user = input.inviteEmail
      ? await this.users.invite(
          actor,
          { email: input.inviteEmail, name: input.fullName },
          { orgId },
        )
      : await this.users.createEmployeeAccount(orgId, {
          username: input.code,
          name: input.fullName,
        });
    const result = await this.prisma.employee.update({
      where: { id: employee.id },
      data: { userId: user.id },
      include: EMPLOYEE_INCLUDE,
    });

    addAuditMetadata({
      after: { code: result.code, fullName: result.fullName },
      ...(input.inviteEmail
        ? { invitedEmail: input.inviteEmail }
        : { username: input.code }),
    });
    return this.toResponse(result);
  }

  async findOne(
    orgId: string,
    actor: AccessTokenPayload,
    id: string,
  ): Promise<EmployeeDetailResponse> {
    const scopePaths = await this.resolveScopePaths(actor);
    const employee = await this.prisma.employee.findFirst({
      where: { id, orgId, deletedAt: null, ...this.scopeWhere(scopePaths, actor.sub) },
      include: {
        ...EMPLOYEE_INCLUDE,
        contracts: { orderBy: { startDate: 'desc' } },
        dependents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return {
      ...(await this.toResponse(employee, { signAvatar: true })),
      contracts: employee.contracts.map(toContractResponse),
      dependents: employee.dependents.map(toDependentResponse),
    };
  }

  /** Hồ sơ của chính user đang đăng nhập — không cần permission. */
  async me(userId: string): Promise<EmployeeDetailResponse | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      include: {
        ...EMPLOYEE_INCLUDE,
        contracts: { orderBy: { startDate: 'desc' } },
        dependents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!employee || employee.deletedAt) return null;
    return {
      ...(await this.toResponse(employee, { signAvatar: true })),
      contracts: employee.contracts.map(toContractResponse),
      dependents: employee.dependents.map(toDependentResponse),
    };
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeResponse> {
    const employee = await this.requireEmployee(orgId, id);
    if (input.code && input.code !== employee.code) {
      const taken = await this.prisma.employee.findFirst({
        where: { orgId, code: input.code, deletedAt: null },
      });
      if (taken) {
        throw new AppException(
          HttpStatus.CONFLICT,
          `Mã nhân viên "${input.code}" đã tồn tại`,
          ERROR_CODES.ORG_CODE_TAKEN,
        );
      }
    }
    if (input.managerId === id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Nhân viên không thể tự làm quản lý của chính mình',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    await this.validateRefs(orgId, input);

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.dob !== undefined
          ? { dob: input.dob ? new Date(input.dob) : null }
          : {}),
        ...(input.gender !== undefined ? { gender: input.gender ?? null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.orgUnitId !== undefined ? { orgUnitId: input.orgUnitId ?? null } : {}),
        ...(input.positionId !== undefined
          ? { positionId: input.positionId ?? null }
          : {}),
        ...(input.managerId !== undefined ? { managerId: input.managerId ?? null } : {}),
        ...(input.worksiteId !== undefined
          ? { worksiteId: input.worksiteId ?? null }
          : {}),
        ...(input.joinDate !== undefined ? { joinDate: new Date(input.joinDate) } : {}),
        ...(input.leaveDate !== undefined
          ? { leaveDate: input.leaveDate ? new Date(input.leaveDate) : null }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...this.profileData(input),
      },
      include: EMPLOYEE_INCLUDE,
    });

    // TERMINATED → khoá tài khoản + revoke toàn bộ phiên (logout realtime)
    if (input.status === 'TERMINATED' && employee.status !== 'TERMINATED') {
      await this.deactivateLinkedUser(updated.userId);
    }

    addAuditMetadata({
      before: { status: employee.status, orgUnitId: employee.orgUnitId },
      after: { status: updated.status, orgUnitId: updated.orgUnitId },
    });
    return this.toResponse(updated);
  }

  async remove(orgId: string, id: string): Promise<{ message: string }> {
    const employee = await this.requireEmployee(orgId, id);
    await this.deactivateLinkedUser(employee.userId);
    // Soft-delete: giữ dữ liệu công/đơn (yêu cầu lưu trữ pháp lý), ẩn khỏi roster/ops.
    // Set status=TERMINATED để tận dụng các filter `status != TERMINATED` sẵn có.
    await this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'TERMINATED' },
    });
    addAuditMetadata({
      before: { code: employee.code, fullName: employee.fullName },
    });
    return { message: `Đã xoá hồ sơ ${employee.fullName}` };
  }

  async uploadAvatar(
    orgId: string,
    id: string,
    file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    const employee = await this.requireEmployee(orgId, id);
    const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
    const key = `${orgId}/avatar/${employee.id}/avatar.${ext}`;
    await this.storage.put({ key, body: file.buffer, contentType: file.mimetype });
    await this.prisma.employee.update({
      where: { id },
      data: { avatarKey: key },
    });
    addAuditMetadata({ after: { avatarKey: key } });
    return { avatarUrl: await this.storage.getSignedUrl(key, 3600) };
  }

  // ===== Import từ Excel =====

  /** Sinh file Excel mẫu (header + ví dụ + sheet hướng dẫn) để user tải về. */
  async buildImportTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(SHEET_NAME);
    ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    // Header in đậm + đóng băng dòng tiêu đề + auto filter
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', wrapText: true };
    headerRow.height = 30;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: IMPORT_COLUMNS.length } };
    // 1 dòng ví dụ (in nghiêng, xám) — XOÁ trước khi nhập dữ liệu thật
    const exampleRow = ws.addRow(IMPORT_COLUMNS.map((c) => c.example));
    exampleRow.font = { italic: true, color: { argb: 'FF9CA3AF' } };

    const guide = wb.addWorksheet('Hướng dẫn');
    guide.getColumn(1).width = 100;
    const lines = [
      'HƯỚNG DẪN NHẬP NHÂN VIÊN TỪ EXCEL',
      '',
      '1. Nhập dữ liệu vào sheet "Nhân viên". XOÁ dòng ví dụ (in nghiêng) trước khi nhập.',
      '2. Các cột có dấu (*) là bắt buộc: Mã NV, Họ tên, Số điện thoại, Ngày vào làm.',
      '3. Mã NV không được trùng. Chỉ gồm chữ, số, gạch ngang, gạch dưới.',
      '4. Ngày nhập theo định dạng YYYY-MM-DD (vd 2025-01-15) hoặc dd/mm/yyyy.',
      '5. Giới tính: Nam / Nữ / Khác.',
      '6. Tình trạng hôn nhân: Độc thân / Đã kết hôn / Ly hôn / Goá.',
      '7. Đơn vị / Chức danh / Địa điểm: nhập đúng TÊN đã tạo trong hệ thống (bỏ trống nếu chưa có).',
      '8. Có "Email mời tài khoản" → gửi link kích hoạt. Bỏ trống → tạo tài khoản đăng nhập bằng MÃ NV + mật khẩu mặc định Abcd123@.',
      '9. Mỗi lần nhập tối đa 500 dòng.',
    ];
    lines.forEach((t) => guide.addRow([t]));
    guide.getRow(1).font = { bold: true, size: 14 };

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * Nhập danh sách nhân viên từ file Excel (theo template). Mỗi dòng được
   * validate riêng + tái sử dụng `create()` (tạo cả tài khoản đăng nhập);
   * dòng lỗi được bỏ qua và gom vào kết quả để báo lại cho user.
   */
  async importEmployees(
    orgId: string,
    actor: AccessTokenPayload,
    fileBuffer: Buffer,
  ): Promise<ImportEmployeesResult> {
    const wb = new ExcelJS.Workbook();
    try {
      // cast: lệch generic Buffer<ArrayBufferLike> giữa @types/node và exceljs
      await wb.xlsx.load(fileBuffer as unknown as ArrayBuffer);
    } catch {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'File Excel không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const ws = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0];
    if (!ws) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Không tìm thấy sheet dữ liệu',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Map tên → id (case-insensitive) để giải nghĩa cột Đơn vị/Chức danh/Địa điểm
    const [units, positions, worksites] = await Promise.all([
      this.prisma.orgUnit.findMany({ where: { orgId }, select: { id: true, name: true } }),
      this.prisma.position.findMany({ where: { orgId }, select: { id: true, name: true } }),
      this.prisma.worksite.findMany({ where: { orgId }, select: { id: true, name: true } }),
    ]);
    const norm = (s: string) => s.trim().toLowerCase();
    const unitByName = new Map(units.map((u) => [norm(u.name), u.id]));
    const posByName = new Map(positions.map((p) => [norm(p.name), p.id]));
    const wsByName = new Map(worksites.map((w) => [norm(w.name), w.id]));

    // Đọc các dòng dữ liệu (từ dòng 2). Bỏ dòng trống / dòng ví dụ mẫu.
    type RawRow = { rowNumber: number; values: Record<string, string | null> };
    const rows: RawRow[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const values: Record<string, string | null> = {};
      let hasData = false;
      IMPORT_COLUMNS.forEach((col, i) => {
        const raw =
          col.key === 'dob' || col.key === 'joinDate' || col.key === 'idIssuedDate'
            ? cellToDateOnly(row.getCell(i + 1).value)
            : cellToString(row.getCell(i + 1).value);
        values[col.key] = raw;
        if (raw) hasData = true;
      });
      if (!hasData) return;
      // Bỏ qua dòng ví dụ mẫu còn sót (mã NV-001 + họ tên ví dụ)
      if (values.code === 'NV-001' && values.fullName === 'Nguyễn Văn A') return;
      rows.push({ rowNumber, values });
    });

    if (rows.length > 500) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Tối đa 500 dòng mỗi lần nhập',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const failed: ImportEmployeesResult['failed'] = [];
    let created = 0;

    for (const { rowNumber, values } of rows) {
      const code = values.code ?? null;
      try {
        // Giải nghĩa tên đơn vị/chức danh/địa điểm → id
        const orgUnitId = this.resolveName(unitByName, values.orgUnitName, 'Đơn vị');
        const positionId = this.resolveName(posByName, values.positionName, 'Chức danh');
        const worksiteId = this.resolveName(wsByName, values.worksiteName, 'Địa điểm');

        const gender = values.gender ? GENDER_MAP[norm(values.gender)] : undefined;
        if (values.gender && !gender) throw new Error(`Giới tính "${values.gender}" không hợp lệ`);
        const maritalStatus = values.maritalStatus
          ? MARITAL_MAP[norm(values.maritalStatus)]
          : undefined;
        if (values.maritalStatus && !maritalStatus) {
          throw new Error(`Tình trạng hôn nhân "${values.maritalStatus}" không hợp lệ`);
        }

        const candidate = {
          code: values.code ?? '',
          fullName: values.fullName ?? '',
          phone: values.phone ?? '',
          joinDate: values.joinDate ?? '',
          dob: values.dob,
          gender,
          inviteEmail: values.inviteEmail,
          personalEmail: values.personalEmail,
          orgUnitId,
          positionId,
          worksiteId,
          idNumber: values.idNumber,
          idIssuedDate: values.idIssuedDate,
          idIssuedPlace: values.idIssuedPlace,
          taxCode: values.taxCode,
          socialInsuranceNo: values.socialInsuranceNo,
          healthInsuranceNo: values.healthInsuranceNo,
          bankAccountNo: values.bankAccountNo,
          bankName: values.bankName,
          bankBranch: values.bankBranch,
          permanentAddress: values.permanentAddress,
          currentAddress: values.currentAddress,
          emergencyContactName: values.emergencyContactName,
          emergencyContactPhone: values.emergencyContactPhone,
          emergencyContactRelation: values.emergencyContactRelation,
          maritalStatus,
          ethnicity: values.ethnicity,
          nationality: values.nationality,
          religion: values.religion,
          educationLevel: values.educationLevel,
          major: values.major,
        };
        const parsed = createEmployeeSchema.safeParse(candidate);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          throw new Error(
            first ? `${first.path.join('.') || 'dữ liệu'}: ${first.message}` : 'Dữ liệu không hợp lệ',
          );
        }
        await this.create(orgId, actor, parsed.data);
        created += 1;
      } catch (err) {
        failed.push({
          row: rowNumber,
          code,
          message: err instanceof AppException ? err.message : (err as Error).message,
        });
      }
    }

    addAuditMetadata({ after: { total: rows.length, created, failed: failed.length } });
    return { total: rows.length, created, failed };
  }

  /** Tra id theo tên (case-insensitive); có tên nhưng không khớp → ném lỗi. */
  private resolveName(
    map: Map<string, string>,
    name: string | null | undefined,
    label: string,
  ): string | undefined {
    if (!name) return undefined;
    const id = map.get(name.trim().toLowerCase());
    if (!id) throw new Error(`${label} "${name}" không tồn tại trong tổ chức`);
    return id;
  }

  // ===== Contracts =====

  async createContract(
    orgId: string,
    employeeId: string,
    input: CreateContractInput,
  ): Promise<ContractResponse> {
    await this.requireEmployee(orgId, employeeId);
    const contract = await this.prisma.employmentContract.create({
      data: {
        orgId,
        employeeId,
        type: input.type,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        note: input.note ?? null,
      },
    });
    addAuditMetadata({ after: { type: contract.type, employeeId } });
    return toContractResponse(contract);
  }

  async uploadContractFile(
    orgId: string,
    employeeId: string,
    contractId: string,
    file: Express.Multer.File,
  ): Promise<ContractResponse> {
    const contract = await this.requireContract(orgId, employeeId, contractId);
    const key = `${orgId}/docs/${employeeId}/contracts/${contractId}/${file.originalname}`;
    await this.storage.put({ key, body: file.buffer, contentType: file.mimetype });
    const updated = await this.prisma.employmentContract.update({
      where: { id: contract.id },
      data: { fileKey: key },
    });
    addAuditMetadata({ after: { fileKey: key } });
    return toContractResponse(updated);
  }

  async getContractFileUrl(
    orgId: string,
    employeeId: string,
    contractId: string,
  ): Promise<{ url: string }> {
    const contract = await this.requireContract(orgId, employeeId, contractId);
    if (!contract.fileKey) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Hợp đồng chưa có file đính kèm',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return { url: await this.storage.getSignedUrl(contract.fileKey, 300) };
  }

  async removeContract(
    orgId: string,
    employeeId: string,
    contractId: string,
  ): Promise<{ message: string }> {
    const contract = await this.requireContract(orgId, employeeId, contractId);
    if (contract.fileKey) await this.storage.delete(contract.fileKey);
    await this.prisma.employmentContract.delete({ where: { id: contract.id } });
    addAuditMetadata({ before: { type: contract.type, employeeId } });
    return { message: 'Đã xoá hợp đồng' };
  }

  // ===== Người phụ thuộc (giảm trừ gia cảnh) =====

  async listDependents(orgId: string, employeeId: string): Promise<DependentResponse[]> {
    await this.requireEmployee(orgId, employeeId);
    const rows = await this.prisma.dependent.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDependentResponse);
  }

  async addDependent(
    orgId: string,
    employeeId: string,
    input: CreateDependentInput,
  ): Promise<DependentResponse> {
    await this.requireEmployee(orgId, employeeId);
    const dep = await this.prisma.dependent.create({
      data: {
        employeeId,
        fullName: input.fullName,
        relationship: input.relationship,
        dob: input.dob ? new Date(input.dob) : null,
        taxCode: input.taxCode ?? null,
        note: input.note ?? null,
      },
    });
    addAuditMetadata({ after: { dependent: dep.fullName } });
    return toDependentResponse(dep);
  }

  async updateDependent(
    orgId: string,
    employeeId: string,
    dependentId: string,
    input: UpdateDependentInput,
  ): Promise<DependentResponse> {
    await this.requireEmployee(orgId, employeeId);
    await this.requireDependent(employeeId, dependentId);
    const dep = await this.prisma.dependent.update({
      where: { id: dependentId },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.relationship !== undefined
          ? { relationship: input.relationship }
          : {}),
        ...(input.dob !== undefined
          ? { dob: input.dob ? new Date(input.dob) : null }
          : {}),
        ...(input.taxCode !== undefined ? { taxCode: input.taxCode ?? null } : {}),
        ...(input.note !== undefined ? { note: input.note ?? null } : {}),
      },
    });
    addAuditMetadata({ after: { dependentId, fullName: dep.fullName } });
    return toDependentResponse(dep);
  }

  async removeDependent(
    orgId: string,
    employeeId: string,
    dependentId: string,
  ): Promise<{ message: string }> {
    await this.requireEmployee(orgId, employeeId);
    const dep = await this.requireDependent(employeeId, dependentId);
    await this.prisma.dependent.delete({ where: { id: dependentId } });
    addAuditMetadata({ before: { dependent: dep.fullName } });
    return { message: `Đã xoá người phụ thuộc ${dep.fullName}` };
  }

  private async requireDependent(employeeId: string, id: string): Promise<Dependent> {
    const dep = await this.prisma.dependent.findFirst({ where: { id, employeeId } });
    if (!dep) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy người phụ thuộc',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return dep;
  }

  // ===== helpers =====

  private async deactivateLinkedUser(userId: string | null): Promise<void> {
    if (!userId) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE' },
    });
    await this.sessions.revokeAllForUser(userId, 'USER_BANNED', {
      forceLogout: true,
    });
    await this.permsCache.invalidateUser(userId, 'status');
  }

  private async requireEmployee(orgId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return employee;
  }

  private async requireContract(orgId: string, employeeId: string, id: string) {
    const contract = await this.prisma.employmentContract.findFirst({
      where: { id, orgId, employeeId },
    });
    if (!contract) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy hợp đồng',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return contract;
  }

  /** orgUnit/position/manager/worksite truyền vào phải thuộc đúng org. */
  private async validateRefs(
    orgId: string,
    input: Pick<
      UpdateEmployeeInput,
      'orgUnitId' | 'positionId' | 'managerId' | 'worksiteId'
    >,
  ): Promise<void> {
    const checks: [string | null | undefined, () => Promise<number>, string][] = [
      [
        input.orgUnitId,
        () =>
          this.prisma.orgUnit.count({ where: { id: input.orgUnitId!, orgId } }),
        'Đơn vị',
      ],
      [
        input.positionId,
        () =>
          this.prisma.position.count({ where: { id: input.positionId!, orgId } }),
        'Chức danh',
      ],
      [
        input.managerId,
        () =>
          this.prisma.employee.count({ where: { id: input.managerId!, orgId } }),
        'Quản lý',
      ],
      [
        input.worksiteId,
        () =>
          this.prisma.worksite.count({ where: { id: input.worksiteId!, orgId } }),
        'Địa điểm',
      ],
    ];
    for (const [value, count, label] of checks) {
      if (value && (await count()) === 0) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          `${label} không tồn tại trong tổ chức`,
          ERROR_CODES.NOT_FOUND,
        );
      }
    }
  }
}
