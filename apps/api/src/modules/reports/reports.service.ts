import { Injectable } from '@nestjs/common';
import type { DashboardStats, OrgAttendanceQuery } from '@repo/shared';
import ExcelJS from 'exceljs';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';

const PRESENT_STATUSES = ['PRESENT', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY'];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
  ) {}

  /** Ngày hôm nay (YYYY-MM-DD) theo timezone của org. */
  private async localToday(orgId: string): Promise<Date> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    const tz = org?.timezone ?? 'Asia/Ho_Chi_Minh';
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return new Date(today);
  }

  async dashboardStats(orgId: string): Promise<DashboardStats> {
    const date = await this.localToday(orgId);
    const [
      employeesActive,
      presentToday,
      lateToday,
      absentToday,
      onLeaveToday,
      pendingApprovals,
      pendingLeave,
    ] = await Promise.all([
      this.prisma.employee.count({
        where: { orgId, deletedAt: null, status: { not: 'TERMINATED' } },
      }),
      this.prisma.timesheetDay.count({
        where: { orgId, date, status: { in: ['PRESENT', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY'] } },
      }),
      this.prisma.timesheetDay.count({
        where: { orgId, date, status: { in: ['LATE', 'LATE_AND_EARLY'] } },
      }),
      this.prisma.timesheetDay.count({ where: { orgId, date, status: 'ABSENT' } }),
      this.prisma.timesheetDay.count({
        where: { orgId, date, status: { in: ['ON_LEAVE', 'HALF_LEAVE'] } },
      }),
      this.prisma.approvalInstance.count({ where: { orgId, status: 'PENDING' } }),
      this.prisma.leaveRequest.count({ where: { orgId, status: 'PENDING' } }),
    ]);
    return {
      employeesActive,
      presentToday,
      lateToday,
      absentToday,
      onLeaveToday,
      pendingApprovals,
      pendingLeave,
    };
  }

  /** Bảng tổng hợp công tháng (1 dòng/NV) — XLSX, theo scope của actor. */
  async attendanceSummaryXlsx(
    orgId: string,
    actor: AccessTokenPayload,
    query: OrgAttendanceQuery,
  ): Promise<Buffer> {
    const { rows } = await this.attendance.timesheetGrid(orgId, actor, query);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Tổng hợp công');
    ws.columns = [
      { header: 'Mã NV', key: 'code', width: 12 },
      { header: 'Họ tên', key: 'name', width: 24 },
      { header: 'Đơn vị', key: 'unit', width: 22 },
      { header: 'Đủ công', key: 'present', width: 9 },
      { header: 'Đi trễ', key: 'late', width: 8 },
      { header: 'Về sớm', key: 'early', width: 9 },
      { header: 'Vắng', key: 'absent', width: 8 },
      { header: 'Nghỉ phép', key: 'leave', width: 10 },
      { header: 'Nghỉ lễ', key: 'holiday', width: 9 },
      { header: 'Giờ công', key: 'workHours', width: 10 },
      { header: 'Giờ tăng ca', key: 'otHours', width: 11 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const row of rows) {
      let present = 0;
      let late = 0;
      let early = 0;
      let absent = 0;
      let leave = 0;
      let holiday = 0;
      let workMin = 0;
      let otMin = 0;
      for (const d of Object.values(row.days)) {
        if (PRESENT_STATUSES.includes(d.status)) present++;
        if (d.status === 'LATE' || d.status === 'LATE_AND_EARLY') late++;
        if (d.status === 'EARLY_LEAVE' || d.status === 'LATE_AND_EARLY') early++;
        if (d.status === 'ABSENT') absent++;
        if (d.status === 'ON_LEAVE' || d.status === 'HALF_LEAVE') leave++;
        if (d.status === 'HOLIDAY') holiday++;
        workMin += d.workMinutes;
        otMin += d.otMinutes;
      }
      ws.addRow({
        code: row.employeeCode,
        name: row.employeeName,
        unit: row.orgUnitName ?? '',
        present,
        late,
        early,
        absent,
        leave,
        holiday,
        workHours: Math.round((workMin / 60) * 10) / 10,
        otHours: Math.round((otMin / 60) * 10) / 10,
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
