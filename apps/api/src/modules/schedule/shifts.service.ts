import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type AssignShiftInput,
  type CreateWorkShiftInput,
  type ShiftAssignmentResponse,
  type UpdateWorkShiftInput,
  type WorkShiftResponse,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { WorkShift } from '../../prisma/prisma.types';

export function toShiftResponse(s: WorkShift): WorkShiftResponse {
  return {
    id: s.id,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    breakStart: s.breakStart,
    breakEnd: s.breakEnd,
    breakMinutes: s.breakMinutes,
    lateGraceMinutes: s.lateGraceMinutes,
    otEnabled: s.otEnabled,
    gianCaEnd: s.gianCaEnd,
    tangCaEnd: s.tangCaEnd,
    otCalcMode: s.otCalcMode,
    workDays: s.workDays,
  };
}

function dateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Ngày liền trước (date-only UTC). */
function prevDay(d: Date): Date {
  return new Date(d.getTime() - 86_400_000);
}

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  // ===== CRUD =====

  async list(orgId: string): Promise<WorkShiftResponse[]> {
    const shifts = await this.prisma.workShift.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    });
    return shifts.map(toShiftResponse);
  }

  async create(orgId: string, input: CreateWorkShiftInput): Promise<WorkShiftResponse> {
    const shift = await this.prisma.workShift.create({
      data: { ...input, workDays: [...new Set(input.workDays)].sort(), orgId },
    });
    addAuditMetadata({ after: { name: shift.name } });
    return toShiftResponse(shift);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateWorkShiftInput,
  ): Promise<WorkShiftResponse> {
    const shift = await this.requireShift(orgId, id);
    const updated = await this.prisma.workShift.update({
      where: { id },
      data: {
        ...input,
        ...(input.workDays
          ? { workDays: [...new Set(input.workDays)].sort() }
          : {}),
      },
    });
    addAuditMetadata({
      before: { name: shift.name, startTime: shift.startTime, endTime: shift.endTime },
      after: { name: updated.name, startTime: updated.startTime, endTime: updated.endTime },
    });
    return toShiftResponse(updated);
  }

  async remove(orgId: string, id: string): Promise<{ message: string }> {
    const shift = await this.requireShift(orgId, id);
    await this.prisma.workShift.delete({ where: { id } });
    addAuditMetadata({ before: { name: shift.name } });
    return { message: `Đã xoá ca ${shift.name}` };
  }

  // ===== Gán ca =====

  /**
   * Gán ca cho 1 nhân viên hoặc cả OrgUnit subtree từ effectiveFrom:
   * đóng assignment đang mở (effectiveTo = from - 1 ngày), xoá assignment
   * tương lai bị thay thế, tạo bản ghi mới open-ended.
   */
  async assign(orgId: string, input: AssignShiftInput): Promise<{ assigned: number }> {
    await this.requireShift(orgId, input.shiftId);
    const from = new Date(input.effectiveFrom);

    let employeeIds: string[];
    if (input.employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: input.employeeId, orgId },
        select: { id: true },
      });
      if (!employee) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'Không tìm thấy nhân viên',
          ERROR_CODES.NOT_FOUND,
        );
      }
      employeeIds = [employee.id];
    } else {
      const unit = await this.prisma.orgUnit.findFirst({
        where: { id: input.orgUnitId!, orgId },
        select: { path: true },
      });
      if (!unit) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'Không tìm thấy đơn vị',
          ERROR_CODES.NOT_FOUND,
        );
      }
      const employees = await this.prisma.employee.findMany({
        where: {
          orgId,
          status: { not: 'TERMINATED' },
          orgUnit: { is: { path: { startsWith: unit.path } } },
        },
        select: { id: true },
      });
      employeeIds = employees.map((e) => e.id);
    }

    await this.prisma.$transaction([
      // Xoá assignment tương lai bị thay thế
      this.prisma.shiftAssignment.deleteMany({
        where: { orgId, employeeId: { in: employeeIds }, effectiveFrom: { gte: from } },
      }),
      // Đóng assignment đang mở
      this.prisma.shiftAssignment.updateMany({
        where: {
          orgId,
          employeeId: { in: employeeIds },
          effectiveFrom: { lt: from },
          effectiveTo: null,
        },
        data: { effectiveTo: prevDay(from) },
      }),
      this.prisma.shiftAssignment.createMany({
        data: employeeIds.map((employeeId) => ({
          orgId,
          employeeId,
          shiftId: input.shiftId,
          effectiveFrom: from,
        })),
      }),
    ]);

    addAuditMetadata({
      after: {
        shiftId: input.shiftId,
        effectiveFrom: input.effectiveFrom,
        assigned: employeeIds.length,
        target: input.employeeId ?? input.orgUnitId,
      },
    });
    return { assigned: employeeIds.length };
  }

  async listAssignments(
    orgId: string,
    employeeId: string,
  ): Promise<ShiftAssignmentResponse[]> {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: { orgId, employeeId },
      include: { shift: { select: { name: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      shiftId: a.shiftId,
      shiftName: a.shift.name,
      effectiveFrom: dateOnly(a.effectiveFrom) ?? '',
      effectiveTo: dateOnly(a.effectiveTo),
    }));
  }

  // ===== Resolve =====

  /**
   * Ca áp dụng cho employee tại 1 ngày:
   * assignment active → defaultShift của unit (leo cây từ gần lên xa) →
   * defaultShift của org → null (NOT_SCHEDULED).
   */
  async resolveShift(employeeId: string, date: string): Promise<WorkShift | null> {
    const day = new Date(date);
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: day },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { shift: true },
    });
    if (assignment) return assignment.shift;

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { orgId: true, orgUnit: { select: { path: true } } },
    });
    if (!employee) return null;

    if (employee.orgUnit) {
      const shiftId = await this.resolveUnitChainShiftId(employee.orgUnit.path);
      if (shiftId) {
        return this.prisma.workShift.findUnique({ where: { id: shiftId } });
      }
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: employee.orgId },
      select: { defaultShift: true },
    });
    return org?.defaultShift ?? null;
  }

  /** defaultShiftId của ancestor gần nhất (kể cả chính nó) trên path. */
  private async resolveUnitChainShiftId(path: string): Promise<string | null> {
    const ids = path.split('/').filter(Boolean);
    if (ids.length === 0) return null;
    const units = await this.prisma.orgUnit.findMany({
      where: { id: { in: ids } },
      select: { id: true, defaultShiftId: true },
    });
    const byId = new Map(units.map((u) => [u.id, u.defaultShiftId]));
    for (let i = ids.length - 1; i >= 0; i--) {
      const shiftId = byId.get(ids[i]!);
      if (shiftId) return shiftId;
    }
    return null;
  }

  private async requireShift(orgId: string, id: string): Promise<WorkShift> {
    const shift = await this.prisma.workShift.findFirst({ where: { id, orgId } });
    if (!shift) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy ca làm việc',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return shift;
  }
}
