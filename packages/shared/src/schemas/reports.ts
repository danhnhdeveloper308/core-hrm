import { z } from 'zod';

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
