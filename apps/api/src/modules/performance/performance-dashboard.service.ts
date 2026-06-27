import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type GoalStatus,
  type PerformanceDashboard,
  type PerformanceDashboardQuery,
} from '@repo/shared';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeesService } from '../employees/employees.service';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Tổng hợp số liệu hiệu suất 1 chu kỳ cho KPI Dashboard (theo phạm vi). */
@Injectable()
export class PerformanceDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  async dashboard(
    orgId: string,
    actor: AccessTokenPayload,
    query: PerformanceDashboardQuery,
  ): Promise<PerformanceDashboard> {
    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: query.cycleId, orgId },
      select: { id: true, name: true },
    });
    if (!cycle) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy chu kỳ đánh giá',
        ERROR_CODES.NOT_FOUND,
      );
    }
    const empWhere = await this.scopeEmployeeWhere(orgId, actor);
    const employeeFilter = { is: empWhere };

    const reviewWhere: Prisma.PerformanceReviewWhereInput = {
      orgId,
      cycleId: cycle.id,
      employee: employeeFilter,
    };
    const doneWhere: Prisma.PerformanceReviewWhereInput = {
      ...reviewWhere,
      status: 'DONE',
      finalScore: { not: null },
    };

    const [
      reviewTotal,
      reviewDone,
      finalAgg,
      ratingGroups,
      doneReviews,
      goalTotal,
      goalProgressAgg,
      goalGroups,
    ] = await Promise.all([
      this.prisma.performanceReview.count({ where: reviewWhere }),
      this.prisma.performanceReview.count({ where: doneWhere }),
      this.prisma.performanceReview.aggregate({
        where: doneWhere,
        _avg: { finalScore: true },
      }),
      this.prisma.performanceReview.groupBy({
        by: ['ratingLabel'],
        where: doneWhere,
        _count: { _all: true },
      }),
      this.prisma.performanceReview.findMany({
        where: doneWhere,
        select: {
          finalScore: true,
          employee: { select: { orgUnit: { select: { name: true } } } },
        },
      }),
      this.prisma.goal.count({
        where: { orgId, cycleId: cycle.id, employee: employeeFilter },
      }),
      this.prisma.goal.aggregate({
        where: { orgId, cycleId: cycle.id, employee: employeeFilter },
        _avg: { progress: true },
      }),
      this.prisma.goal.groupBy({
        by: ['status'],
        where: { orgId, cycleId: cycle.id, employee: employeeFilter },
        _count: { _all: true },
      }),
    ]);

    const ratingDistribution = ratingGroups
      .map((g) => ({
        label: g.ratingLabel ?? 'Chưa xếp loại',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    // Điểm chốt trung bình theo đơn vị (gộp trong JS vì group theo relation).
    const byUnit = new Map<string, { sum: number; count: number }>();
    for (const r of doneReviews) {
      if (r.finalScore === null) continue;
      const name = r.employee?.orgUnit?.name ?? 'Chưa gán đơn vị';
      const cur = byUnit.get(name) ?? { sum: 0, count: 0 };
      cur.sum += r.finalScore;
      cur.count += 1;
      byUnit.set(name, cur);
    }
    const scoreByUnit = [...byUnit.entries()]
      .map(([unitName, v]) => ({
        unitName,
        avgScore: round2(v.sum / v.count),
        count: v.count,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const goalByStatus = goalGroups.map((g) => ({
      status: g.status as GoalStatus,
      count: g._count._all,
    }));

    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      summary: {
        reviewTotal,
        reviewDone,
        avgFinalScore:
          finalAgg._avg.finalScore !== null
            ? round2(finalAgg._avg.finalScore)
            : null,
        goalTotal,
        avgGoalProgress:
          goalProgressAgg._avg.progress !== null
            ? round2(goalProgressAgg._avg.progress)
            : null,
      },
      ratingDistribution,
      scoreByUnit,
      goalByStatus,
    };
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
