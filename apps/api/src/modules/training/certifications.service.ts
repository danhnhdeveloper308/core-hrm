import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CertificationResponse,
  type CertificationStatus,
  type CreateCertificationInput,
  type CursorPaginated,
  type ListCertificationsQuery,
  type UpdateCertificationInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeesService } from '../employees/employees.service';

const MS_PER_DAY = 86_400_000;
const EXPIRING_DAYS = 30;

const INCLUDE = {
  employee: { select: { fullName: true } },
  trainingCourse: { select: { title: true } },
} as const;

type CertRow = Prisma.CertificationGetPayload<{ include: typeof INCLUDE }>;

const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

/** Suy ra trạng thái + số ngày tới hạn từ expiryDate. */
function expiryInfo(expiryDate: Date | null): {
  status: CertificationStatus;
  daysToExpiry: number | null;
} {
  if (!expiryDate) return { status: 'VALID', daysToExpiry: null };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const end = new Date(expiryDate);
  end.setUTCHours(0, 0, 0, 0);
  const days = Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
  const status: CertificationStatus =
    days < 0 ? 'EXPIRED' : days <= EXPIRING_DAYS ? 'EXPIRING' : 'VALID';
  return { status, daysToExpiry: days };
}

function toResponse(c: CertRow): CertificationResponse {
  const { status, daysToExpiry } = expiryInfo(c.expiryDate);
  return {
    id: c.id,
    employeeId: c.employeeId,
    employeeName: c.employee?.fullName ?? null,
    name: c.name,
    issuer: c.issuer,
    issuedDate: dateOnly(c.issuedDate),
    expiryDate: c.expiryDate ? dateOnly(c.expiryDate) : null,
    credentialId: c.credentialId,
    fileKey: c.fileKey,
    trainingCourseId: c.trainingCourseId,
    courseTitle: c.trainingCourse?.title ?? null,
    status,
    daysToExpiry,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Chứng chỉ nhân viên (scope như đào tạo). Cron nhắc hết hạn ở reminder service. */
@Injectable()
export class CertificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  async list(
    orgId: string,
    actor: AccessTokenPayload,
    query: ListCertificationsQuery,
  ): Promise<CursorPaginated<CertificationResponse>> {
    let employeeFilter: Prisma.EmployeeWhereInput;
    if (query.mine) {
      employeeFilter = { id: await this.ownEmployeeId(orgId, actor) };
    } else {
      employeeFilter = await this.scopeEmployeeWhere(orgId, actor);
      if (query.employeeId) {
        employeeFilter = { ...employeeFilter, id: query.employeeId };
      }
    }
    const where: Prisma.CertificationWhereInput = {
      orgId,
      employee: { is: employeeFilter },
      ...(query.expiringInDays
        ? {
            expiryDate: {
              not: null,
              lte: new Date(Date.now() + query.expiringInDays * MS_PER_DAY),
            },
          }
        : {}),
    };
    const rows = await this.prisma.certification.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ expiryDate: 'asc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: items.map(toResponse),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async create(
    orgId: string,
    input: CreateCertificationInput,
  ): Promise<CertificationResponse> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Nhân viên không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    if (input.trainingCourseId) {
      await this.assertCourse(orgId, input.trainingCourseId);
    }
    const created = await this.prisma.certification.create({
      data: {
        orgId,
        employeeId: input.employeeId,
        name: input.name,
        issuer: input.issuer ?? null,
        issuedDate: new Date(input.issuedDate),
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        credentialId: input.credentialId ?? null,
        fileKey: input.fileKey ?? null,
        trainingCourseId: input.trainingCourseId ?? null,
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { name: input.name, employeeId: input.employeeId } });
    return toResponse(created);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateCertificationInput,
  ): Promise<CertificationResponse> {
    await this.require(orgId, id);
    if (input.trainingCourseId) {
      await this.assertCourse(orgId, input.trainingCourseId);
    }
    const updated = await this.prisma.certification.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.issuer !== undefined ? { issuer: input.issuer } : {}),
        ...(input.issuedDate !== undefined
          ? { issuedDate: new Date(input.issuedDate) }
          : {}),
        ...(input.expiryDate !== undefined
          ? { expiryDate: input.expiryDate ? new Date(input.expiryDate) : null }
          : {}),
        ...(input.credentialId !== undefined
          ? { credentialId: input.credentialId }
          : {}),
        ...(input.fileKey !== undefined ? { fileKey: input.fileKey } : {}),
        ...(input.trainingCourseId !== undefined
          ? { trainingCourseId: input.trainingCourseId }
          : {}),
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { name: updated.name } });
    return toResponse(updated);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    const existing = await this.require(orgId, id);
    await this.prisma.certification.delete({ where: { id } });
    addAuditMetadata({ before: { name: existing.name } });
    return { id };
  }

  // ===== helpers =====

  private async require(orgId: string, id: string): Promise<CertRow> {
    const c = await this.prisma.certification.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!c) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy chứng chỉ',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return c;
  }

  private async assertCourse(orgId: string, courseId: string): Promise<void> {
    const course = await this.prisma.trainingCourse.findFirst({
      where: { id: courseId, orgId },
      select: { id: true },
    });
    if (!course) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Khoá đào tạo không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
  }

  private async ownEmployeeId(
    orgId: string,
    actor: AccessTokenPayload,
  ): Promise<string> {
    const e = await this.prisma.employee.findFirst({
      where: { userId: actor.sub, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!e) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Tài khoản chưa gắn hồ sơ nhân viên',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    return e.id;
  }

  private async scopeEmployeeWhere(
    orgId: string,
    actor: AccessTokenPayload,
  ): Promise<Prisma.EmployeeWhereInput> {
    const paths = await this.employees.resolveScopePaths(actor);
    if (paths === null) return { orgId, deletedAt: null };
    return {
      orgId,
      deletedAt: null,
      OR: [
        ...paths.map((p) => ({
          orgUnit: { is: { path: { startsWith: p } } },
        })),
        { userId: actor.sub },
      ],
    };
  }
}
