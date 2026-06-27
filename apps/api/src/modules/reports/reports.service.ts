import { Injectable } from '@nestjs/common';
import type {
  AttendanceDashboard,
  AttendanceDashboardQuery,
  DashboardStats,
  OrgAttendanceQuery,
  OrgChartLevel,
  OrgChartQuery,
} from '@repo/shared';
import ExcelJS from 'exceljs';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { EmployeesService } from '../employees/employees.service';

const PRESENT_STATUSES = ['PRESENT', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY'];
const PRESENT_SET = new Set<string>(PRESENT_STATUSES);
const LATE_SET = new Set<string>(['LATE', 'LATE_AND_EARLY']);
const EARLY_SET = new Set<string>(['EARLY_LEAVE', 'LATE_AND_EARLY']);
const ONLEAVE_SET = new Set<string>(['ON_LEAVE', 'HALF_LEAVE']);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly employees: EmployeesService,
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

  /**
   * Sơ đồ tổ chức — LAZY theo nhánh (1 cấp/lần) để chịu được tập đoàn nhiều
   * nghìn node. Trả con trực tiếp của `root` (hoặc cấp gốc nếu không có root).
   */
  async orgChart(orgId: string, query: OrgChartQuery): Promise<OrgChartLevel> {
    return query.mode === 'people'
      ? this.orgChartPeople(orgId, query.rootEmployeeId)
      : this.orgChartUnits(orgId, query.rootUnitId);
  }

  /** mode=unit: con của 1 đơn vị + headcount TOÀN NHÁNH (path prefix) + số đv con. */
  private async orgChartUnits(
    orgId: string,
    rootUnitId?: string,
  ): Promise<OrgChartLevel> {
    const children = await this.prisma.orgUnit.findMany({
      where: { orgId, parentId: rootUnitId ?? null },
      include: {
        type: { select: { name: true, rank: true } },
        manager: { select: { fullName: true } },
      },
      orderBy: [{ type: { rank: 'asc' } }, { name: 'asc' }],
    });
    if (children.length === 0) return { mode: 'unit', nodes: [] };
    const ids = children.map((c) => c.id);

    // Số đơn vị con trực tiếp của mỗi child — 1 query, tránh N+1.
    const childGroups = await this.prisma.orgUnit.groupBy({
      by: ['parentId'],
      where: { orgId, parentId: { in: ids } },
      _count: { _all: true },
    });
    const childCountMap = new Map(
      childGroups.map((g) => [g.parentId, g._count._all]),
    );

    // Headcount toàn nhánh: NV thuộc đv con HOẶC mọi đv con cháu (path prefix).
    // 1 query duy nhất cho cả cấp — index [orgId, path].
    const parentCond = rootUnitId
      ? Prisma.sql`c."parentId" = ${rootUnitId}::uuid`
      : Prisma.sql`c."parentId" IS NULL`;
    const heads = await this.prisma.$queryRaw<
      { id: string; headcount: bigint }[]
    >`
      SELECT c.id, COUNT(e.id) AS headcount
      FROM "OrgUnit" c
      LEFT JOIN "OrgUnit" eu
        ON eu."orgId" = c."orgId" AND eu."path" LIKE c."path" || '%'
      LEFT JOIN "Employee" e
        ON e."orgUnitId" = eu.id
        AND e."deletedAt" IS NULL AND e."status" <> 'TERMINATED'
      WHERE c."orgId" = ${orgId}::uuid AND ${parentCond}
      GROUP BY c.id
    `;
    const headMap = new Map(heads.map((h) => [h.id, Number(h.headcount)]));

    return {
      mode: 'unit',
      nodes: children.map((c) => {
        const childCount = childCountMap.get(c.id) ?? 0;
        return {
          id: c.id,
          parentId: c.parentId,
          name: c.name,
          subtitle: c.type.name,
          code: c.code,
          meta: c.manager?.fullName ?? null,
          headcount: headMap.get(c.id) ?? 0,
          childCount,
          hasChildren: childCount > 0,
        };
      }),
    };
  }

  /** mode=people: report trực tiếp của 1 NV (root rỗng = NV không có quản lý). */
  private async orgChartPeople(
    orgId: string,
    rootEmployeeId?: string,
  ): Promise<OrgChartLevel> {
    const reports = await this.prisma.employee.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: { not: 'TERMINATED' },
        managerId: rootEmployeeId ?? null,
      },
      select: {
        id: true,
        managerId: true,
        fullName: true,
        position: { select: { name: true } },
        orgUnit: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    if (reports.length === 0) return { mode: 'people', nodes: [] };
    const ids = reports.map((r) => r.id);

    const groups = await this.prisma.employee.groupBy({
      by: ['managerId'],
      where: {
        orgId,
        deletedAt: null,
        status: { not: 'TERMINATED' },
        managerId: { in: ids },
      },
      _count: { _all: true },
    });
    const reportCountMap = new Map(
      groups.map((g) => [g.managerId, g._count._all]),
    );

    return {
      mode: 'people',
      nodes: reports.map((r) => {
        const count = reportCountMap.get(r.id) ?? 0;
        return {
          id: r.id,
          parentId: r.managerId,
          name: r.fullName,
          subtitle: r.position?.name ?? null,
          code: null,
          meta: r.orgUnit?.name ?? null,
          headcount: count,
          childCount: count,
          hasChildren: count > 0,
        };
      }),
    };
  }

  /**
   * Dashboard chấm công: time-series theo ngày + tổng KPI + phân bổ theo đơn vị
   * + top đi trễ. Aggregate ở DB (groupBy) — KHÔNG nạp từng dòng công vào RAM.
   * Tôn trọng scope actor (HR/admin = toàn org; UNIT_MANAGER = subtree quản lý).
   */
  async attendanceDashboard(
    orgId: string,
    actor: AccessTokenPayload,
    query: AttendanceDashboardQuery,
  ): Promise<AttendanceDashboard> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const scopePaths = await this.employees.resolveScopePaths(actor);

    // Subtree của đơn vị được chọn (gồm cả đơn vị con).
    let unitPath: string | null = null;
    if (query.orgUnitId) {
      const unit = await this.prisma.orgUnit.findFirst({
        where: { id: query.orgUnitId, orgId },
        select: { path: true },
      });
      unitPath = unit?.path ?? null;
    }

    const and: Prisma.EmployeeWhereInput[] = [];
    if (unitPath) {
      and.push({ orgUnit: { is: { path: { startsWith: unitPath } } } });
    }
    if (scopePaths) {
      and.push({
        OR: [
          ...scopePaths.map((p) => ({
            orgUnit: { is: { path: { startsWith: p } } },
          })),
          { userId: actor.sub },
        ],
      });
    }
    const where: Prisma.TimesheetDayWhereInput = {
      orgId,
      date: { gte: from, lte: to },
      employee: {
        is: {
          orgId,
          deletedAt: null,
          status: { not: 'TERMINATED' },
          ...(and.length ? { AND: and } : {}),
        },
      },
    };

    const [byDateStatus, byEmpStatus] = await Promise.all([
      this.prisma.timesheetDay.groupBy({
        by: ['date', 'status'],
        where,
        _count: { _all: true },
        _sum: { workMinutes: true, otMinutes: true },
      }),
      this.prisma.timesheetDay.groupBy({
        by: ['employeeId', 'status'],
        where,
        _count: { _all: true },
      }),
    ]);

    // ----- totals + series theo ngày -----
    const totals = {
      present: 0,
      late: 0,
      earlyLeave: 0,
      absent: 0,
      onLeave: 0,
      workHours: 0,
      otHours: 0,
    };
    const seriesMap = new Map<
      string,
      {
        date: string;
        present: number;
        late: number;
        earlyLeave: number;
        absent: number;
        onLeave: number;
      }
    >();
    let workMin = 0;
    let otMin = 0;
    for (const row of byDateStatus) {
      const dateStr = row.date.toISOString().slice(0, 10);
      const point =
        seriesMap.get(dateStr) ??
        { date: dateStr, present: 0, late: 0, earlyLeave: 0, absent: 0, onLeave: 0 };
      const n = row._count._all;
      if (PRESENT_SET.has(row.status)) {
        point.present += n;
        totals.present += n;
      }
      if (LATE_SET.has(row.status)) {
        point.late += n;
        totals.late += n;
      }
      if (EARLY_SET.has(row.status)) {
        point.earlyLeave += n;
        totals.earlyLeave += n;
      }
      if (row.status === 'ABSENT') {
        point.absent += n;
        totals.absent += n;
      }
      if (ONLEAVE_SET.has(row.status)) {
        point.onLeave += n;
        totals.onLeave += n;
      }
      seriesMap.set(dateStr, point);
      workMin += row._sum.workMinutes ?? 0;
      otMin += row._sum.otMinutes ?? 0;
    }
    totals.workHours = Math.round((workMin / 60) * 10) / 10;
    totals.otHours = Math.round((otMin / 60) * 10) / 10;
    const series = [...seriesMap.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // ----- byUnit + topLate (map employee → đơn vị) -----
    const empIds = [...new Set(byEmpStatus.map((r) => r.employeeId))];
    const emps = empIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: empIds } },
          select: {
            id: true,
            code: true,
            fullName: true,
            orgUnitId: true,
            orgUnit: { select: { name: true } },
          },
        })
      : [];
    const empMap = new Map(emps.map((e) => [e.id, e]));

    const unitAgg = new Map<
      string,
      {
        orgUnitId: string | null;
        orgUnitName: string;
        present: number;
        late: number;
        absent: number;
        onLeave: number;
        total: number;
      }
    >();
    const lateByEmp = new Map<string, number>();
    for (const row of byEmpStatus) {
      const emp = empMap.get(row.employeeId);
      if (!emp) continue;
      const n = row._count._all;
      const unitKey = emp.orgUnitId ?? '__none__';
      const agg =
        unitAgg.get(unitKey) ??
        {
          orgUnitId: emp.orgUnitId,
          orgUnitName: emp.orgUnit?.name ?? 'Chưa gán đơn vị',
          present: 0,
          late: 0,
          absent: 0,
          onLeave: 0,
          total: 0,
        };
      if (PRESENT_SET.has(row.status)) agg.present += n;
      if (LATE_SET.has(row.status)) agg.late += n;
      if (row.status === 'ABSENT') agg.absent += n;
      if (ONLEAVE_SET.has(row.status)) agg.onLeave += n;
      agg.total += n;
      unitAgg.set(unitKey, agg);
      if (LATE_SET.has(row.status)) {
        lateByEmp.set(row.employeeId, (lateByEmp.get(row.employeeId) ?? 0) + n);
      }
    }

    const byUnit = [...unitAgg.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map((u) => ({
        orgUnitId: u.orgUnitId,
        orgUnitName: u.orgUnitName,
        present: u.present,
        late: u.late,
        absent: u.absent,
        onLeave: u.onLeave,
      }));

    const topLate = [...lateByEmp.entries()]
      .map(([employeeId, lateCount]) => {
        const e = empMap.get(employeeId)!;
        return {
          employeeId,
          employeeName: e.fullName,
          employeeCode: e.code,
          orgUnitName: e.orgUnit?.name ?? null,
          lateCount,
        };
      })
      .sort((a, b) => b.lateCount - a.lateCount)
      .slice(0, 10);

    return { totals, series, byUnit, topLate };
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
