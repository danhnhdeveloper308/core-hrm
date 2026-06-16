/**
 * Unit tests cho 2 helper domain quan trọng (acceptance Phase 3):
 * - resolveShift: đổi ca giữa kỳ, kế thừa defaultShift theo cây, org default.
 * - isWorkingDay: ngày lễ cả/nửa ngày, cuối tuần theo workDays,
 *   override calendar ở unit con.
 * Prisma được mock bằng object thường — không cần DB.
 */
import type { PrismaService } from '../../prisma/prisma.service';
import { CalendarsService, weekdayOf } from './calendars.service';
import { ShiftsService } from './shifts.service';

const ORG = 'org-1';

const shiftA = {
  id: 'shift-a',
  orgId: ORG,
  name: 'Ca hành chính',
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: 60,
  lateGraceMinutes: 5,
  otEnabled: false,
  workDays: [1, 2, 3, 4, 5],
};
const shiftB = { ...shiftA, id: 'shift-b', name: 'Ca chiều' };
const shiftSixDays = { ...shiftA, id: 'shift-6d', workDays: [1, 2, 3, 4, 5, 6] };

describe('weekdayOf', () => {
  it('tính đúng thứ: 2026-06-13 là Thứ 7, 2026-06-14 là Chủ nhật', () => {
    expect(weekdayOf('2026-06-13')).toBe(6);
    expect(weekdayOf('2026-06-14')).toBe(7);
    expect(weekdayOf('2026-06-15')).toBe(1); // Thứ 2
  });
});

describe('ShiftsService.resolveShift', () => {
  function makeService(overrides: {
    assignments?: {
      shiftId: string;
      effectiveFrom: Date;
      effectiveTo: Date | null;
      shift: typeof shiftA;
    }[];
    employee?: unknown;
    units?: { id: string; defaultShiftId: string | null }[];
    orgDefaultShift?: typeof shiftA | null;
  }) {
    const assignments = overrides.assignments ?? [];
    const prisma = {
      shiftAssignment: {
        // Mô phỏng query: active tại ngày + orderBy effectiveFrom desc
        findFirst: jest.fn(
          ({ where }: { where: { effectiveFrom: { lte: Date } } }) => {
            const day = where.effectiveFrom.lte;
            const active = assignments
              .filter(
                (a) =>
                  a.effectiveFrom <= day &&
                  (a.effectiveTo === null || a.effectiveTo >= day),
              )
              .sort(
                (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
              );
            return Promise.resolve(active[0] ?? null);
          },
        ),
      },
      employee: {
        findUnique: jest.fn(() => Promise.resolve(overrides.employee ?? null)),
      },
      orgUnit: {
        findMany: jest.fn(() => Promise.resolve(overrides.units ?? [])),
      },
      workShift: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) => {
          const all = [shiftA, shiftB, shiftSixDays];
          return Promise.resolve(all.find((s) => s.id === where.id) ?? null);
        }),
      },
      organization: {
        findUnique: jest.fn(() =>
          Promise.resolve({ defaultShift: overrides.orgDefaultShift ?? null }),
        ),
      },
    };
    return new ShiftsService(prisma as unknown as PrismaService);
  }

  it('đổi ca giữa kỳ: trước mốc dùng ca cũ, sau mốc dùng ca mới', async () => {
    const service = makeService({
      assignments: [
        {
          shiftId: shiftA.id,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: new Date('2026-05-31'),
          shift: shiftA,
        },
        {
          shiftId: shiftB.id,
          effectiveFrom: new Date('2026-06-01'),
          effectiveTo: null,
          shift: shiftB,
        },
      ],
    });
    expect((await service.resolveShift('emp', '2026-05-15'))?.id).toBe('shift-a');
    expect((await service.resolveShift('emp', '2026-06-15'))?.id).toBe('shift-b');
  });

  it('không có assignment → kế thừa defaultShift của ancestor GẦN NHẤT trên cây', async () => {
    const service = makeService({
      employee: {
        orgId: ORG,
        orgUnit: { path: '/root/factory/team/' },
      },
      // root có ca A, factory có ca B, team không có → lấy của factory (gần hơn)
      units: [
        { id: 'root', defaultShiftId: shiftA.id },
        { id: 'factory', defaultShiftId: shiftB.id },
        { id: 'team', defaultShiftId: null },
      ],
    });
    expect((await service.resolveShift('emp', '2026-06-15'))?.id).toBe('shift-b');
  });

  it('cây không cấu hình → fallback ca mặc định của org; org không có → null', async () => {
    const withDefault = makeService({
      employee: { orgId: ORG, orgUnit: { path: '/root/' } },
      units: [{ id: 'root', defaultShiftId: null }],
      orgDefaultShift: shiftA,
    });
    expect((await withDefault.resolveShift('emp', '2026-06-15'))?.id).toBe('shift-a');

    const noDefault = makeService({
      employee: { orgId: ORG, orgUnit: null },
      orgDefaultShift: null,
    });
    expect(await noDefault.resolveShift('emp', '2026-06-15')).toBeNull();
  });
});

describe('CalendarsService.isWorkingDay', () => {
  function makeService(overrides: {
    /** unitId → path */
    unitPaths?: Record<string, string>;
    /** unitId → holidayCalendarId */
    unitCalendars?: Record<string, string | null>;
    /** unitId → workDays của defaultShift */
    unitWorkDays?: Record<string, number[] | null>;
    orgCalendarId?: string | null;
    orgWorkDays?: number[] | null;
    /** Kỳ nghỉ: calendarId → danh sách khoảng [start, end, name] (YYYY-MM-DD). */
    holidays?: Record<
      string,
      { start: string; end: string; name: string }[]
    >;
  }) {
    const prisma = {
      orgUnit: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) => {
          const path = overrides.unitPaths?.[where.id];
          return Promise.resolve(path ? { path } : null);
        }),
        findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            where.id.in.map((id) => ({
              id,
              holidayCalendarId: overrides.unitCalendars?.[id] ?? null,
              defaultShift: overrides.unitWorkDays?.[id]
                ? { workDays: overrides.unitWorkDays[id] }
                : null,
            })),
          ),
        ),
      },
      organization: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            defaultCalendarId: overrides.orgCalendarId ?? null,
            defaultShift: overrides.orgWorkDays
              ? { workDays: overrides.orgWorkDays }
              : null,
          }),
        ),
      },
      holiday: {
        findUnique: jest.fn(
          ({
            where,
          }: {
            where: { calendarId_date: { calendarId: string; date: Date } };
          }) => {
            const key = `${where.calendarId_date.calendarId}:${where.calendarId_date.date.toISOString().slice(0, 10)}`;
            const h = overrides.holidays?.[key];
            return Promise.resolve(h ? { name: h.name, isHalfDay: h.isHalfDay } : null);
          },
        ),
      },
    };
    return new CalendarsService(prisma as unknown as PrismaService);
  }

  it('ngày lễ cả ngày → HOLIDAY không làm việc; nửa ngày → HOLIDAY vẫn làm', async () => {
    const service = makeService({
      orgCalendarId: 'cal-org',
      holidays: {
        'cal-org:2026-09-02': { name: 'Quốc khánh', isHalfDay: false },
        'cal-org:2026-12-31': { name: 'Tất niên', isHalfDay: true },
      },
    });
    const full = await service.isWorkingDay(ORG, null, '2026-09-02');
    expect(full).toMatchObject({ working: false, dayType: 'HOLIDAY', isHalfDay: false });

    const half = await service.isWorkingDay(ORG, null, '2026-12-31');
    expect(half).toMatchObject({ working: true, dayType: 'HOLIDAY', isHalfDay: true });
  });

  it('cuối tuần theo workDays: ca 6 ngày làm Thứ 7, ca 5 ngày nghỉ', async () => {
    // 2026-06-13 là Thứ 7
    const sixDays = makeService({ orgWorkDays: [1, 2, 3, 4, 5, 6] });
    expect((await sixDays.isWorkingDay(ORG, null, '2026-06-13')).working).toBe(true);

    const fiveDays = makeService({ orgWorkDays: [1, 2, 3, 4, 5] });
    const result = await fiveDays.isWorkingDay(ORG, null, '2026-06-13');
    expect(result).toMatchObject({ working: false, dayType: 'WEEKEND' });
  });

  it('workDaysOverride (ca resolve theo employee) thắng fallback unit/org', async () => {
    const service = makeService({ orgWorkDays: [1, 2, 3, 4, 5] });
    const result = await service.isWorkingDay(ORG, null, '2026-06-13', [6, 7]);
    expect(result.working).toBe(true);
  });

  it('unit con override calendar: lễ riêng của nhà máy chỉ áp cho subtree đó', async () => {
    const service = makeService({
      unitPaths: { team: '/root/factory/team/' },
      unitCalendars: { root: null, factory: 'cal-factory', team: null },
      orgCalendarId: 'cal-org',
      holidays: {
        'cal-factory:2026-07-01': { name: 'Nghỉ bảo trì nhà máy', isHalfDay: false },
      },
    });
    // Unit trong subtree nhà máy → dính lễ riêng
    const inFactory = await service.isWorkingDay(ORG, 'team', '2026-07-01');
    expect(inFactory).toMatchObject({
      dayType: 'HOLIDAY',
      holidayName: 'Nghỉ bảo trì nhà máy',
    });
    // Org-level (không thuộc nhà máy) → ngày thường
    const elsewhere = await service.isWorkingDay(ORG, null, '2026-07-01');
    expect(elsewhere.dayType).toBe('WORKING');
  });
});
