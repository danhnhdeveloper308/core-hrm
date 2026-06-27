import { z } from 'zod';
import { dateOnlySchema } from './employee';

/** Số liệu tổng quan dashboard (phạm vi org). */
export const dashboardStatsSchema = z.object({
  employeesActive: z.number().int(),
  presentToday: z.number().int(),
  lateToday: z.number().int(),
  absentToday: z.number().int(),
  onLeaveToday: z.number().int(),
  pendingApprovals: z.number().int(),
  pendingLeave: z.number().int(),
});
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// ===== Sơ đồ tổ chức (Org Chart) =====

/** Chế độ vẽ: theo ĐƠN VỊ (cây phòng ban) hoặc theo NGƯỜI (reporting line). */
export const orgChartModeSchema = z.enum(['unit', 'people']);
export type OrgChartMode = z.infer<typeof orgChartModeSchema>;

/**
 * Lazy theo nhánh (tối ưu cho tập đoàn nhiều nghìn node): không truyền root →
 * trả cấp cao nhất; truyền root → trả CON TRỰC TIẾP 1 cấp. FE mở từng nhánh.
 */
export const orgChartQuerySchema = z.object({
  mode: orgChartModeSchema.default('unit'),
  /** mode=unit: id đơn vị cha cần mở (bỏ trống = các đơn vị gốc). */
  rootUnitId: z.uuid().optional(),
  /** mode=people: id nhân viên cha cần mở (bỏ trống = NV không có quản lý). */
  rootEmployeeId: z.uuid().optional(),
});
export type OrgChartQuery = z.infer<typeof orgChartQuerySchema>;

/** 1 node trong sơ đồ — dùng chung 2 mode, field diễn giải theo mode. */
export const orgChartNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  /** Loại đơn vị (mode=unit) hoặc chức danh (mode=people). */
  subtitle: z.string().nullable(),
  /** Mã đơn vị (mode=unit). */
  code: z.string().nullable(),
  /** Quản lý đơn vị (mode=unit) hoặc đơn vị của NV (mode=people). */
  meta: z.string().nullable(),
  /** mode=unit: tổng NV toàn nhánh; mode=people: số report trực tiếp. */
  headcount: z.number().int(),
  /** Số node con có thể mở tiếp. */
  childCount: z.number().int(),
  hasChildren: z.boolean(),
});
export type OrgChartNode = z.infer<typeof orgChartNodeSchema>;

/** Trả đúng 1 cấp con (lazy): nodes = con của root, hoặc cấp gốc khi không có root. */
export const orgChartLevelSchema = z.object({
  mode: orgChartModeSchema,
  nodes: z.array(orgChartNodeSchema),
});
export type OrgChartLevel = z.infer<typeof orgChartLevelSchema>;

// ===== Dashboard chấm công =====

/** Lọc dashboard chấm công: khoảng ngày + đơn vị (subtree). */
export const attendanceDashboardQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  /** Đơn vị gốc — gồm cả các đơn vị con (subtree). */
  orgUnitId: z.uuid().optional(),
});
export type AttendanceDashboardQuery = z.infer<
  typeof attendanceDashboardQuerySchema
>;

/** 1 điểm time-series theo ngày. */
export const attendanceDashboardPointSchema = z.object({
  date: z.string(),
  present: z.number().int(),
  late: z.number().int(),
  earlyLeave: z.number().int(),
  absent: z.number().int(),
  onLeave: z.number().int(),
});

export const attendanceDashboardSchema = z.object({
  /** Tổng cộng trong khoảng (số lượt ngày-công + giờ). */
  totals: z.object({
    present: z.number().int(),
    late: z.number().int(),
    earlyLeave: z.number().int(),
    absent: z.number().int(),
    onLeave: z.number().int(),
    workHours: z.number(),
    otHours: z.number(),
  }),
  series: z.array(attendanceDashboardPointSchema),
  /** Phân bổ theo đơn vị (top theo tổng lượt). */
  byUnit: z.array(
    z.object({
      orgUnitId: z.string().nullable(),
      orgUnitName: z.string(),
      present: z.number().int(),
      late: z.number().int(),
      absent: z.number().int(),
      onLeave: z.number().int(),
    }),
  ),
  /** Top nhân viên đi trễ nhiều nhất. */
  topLate: z.array(
    z.object({
      employeeId: z.string(),
      employeeName: z.string(),
      employeeCode: z.string(),
      orgUnitName: z.string().nullable(),
      lateCount: z.number().int(),
    }),
  ),
});
export type AttendanceDashboard = z.infer<typeof attendanceDashboardSchema>;
