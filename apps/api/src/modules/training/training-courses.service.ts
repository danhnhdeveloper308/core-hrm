import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateTrainingCourseInput,
  type CursorPaginated,
  type ListTrainingCoursesQuery,
  type TrainingCourseResponse,
  type UpdateTrainingCourseInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const INCLUDE = {
  _count: { select: { sessions: true } },
} as const;

type CourseRow = Prisma.TrainingCourseGetPayload<{ include: typeof INCLUDE }>;

function toResponse(c: CourseRow): TrainingCourseResponse {
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    mode: c.mode,
    provider: c.provider,
    durationHours: c.durationHours,
    cost: c.cost,
    description: c.description,
    active: c.active,
    sessionCount: c._count.sessions,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Danh mục khoá đào tạo (catalog). Lớp/đợt mở ở P-E.2. */
@Injectable()
export class TrainingCoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    query: ListTrainingCoursesQuery,
  ): Promise<CursorPaginated<TrainingCourseResponse>> {
    const where: Prisma.TrainingCourseWhereInput = {
      orgId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const rows = await this.prisma.trainingCourse.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: items.map((c) => toResponse(c)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async create(
    orgId: string,
    input: CreateTrainingCourseInput,
  ): Promise<TrainingCourseResponse> {
    const created = await this.prisma.trainingCourse.create({
      data: {
        orgId,
        title: input.title,
        category: input.category ?? null,
        mode: input.mode,
        provider: input.provider ?? null,
        durationHours: input.durationHours ?? null,
        cost: input.cost ?? null,
        description: input.description ?? null,
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { title: input.title, mode: input.mode } });
    return toResponse(created);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateTrainingCourseInput,
  ): Promise<TrainingCourseResponse> {
    await this.require(orgId, id);
    const updated = await this.prisma.trainingCourse.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.durationHours !== undefined
          ? { durationHours: input.durationHours }
          : {}),
        ...(input.cost !== undefined ? { cost: input.cost } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { title: updated.title } });
    return toResponse(updated);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    const existing = await this.require(orgId, id);
    await this.prisma.trainingCourse.delete({ where: { id } });
    addAuditMetadata({ before: { title: existing.title } });
    return { id };
  }

  private async require(orgId: string, id: string): Promise<CourseRow> {
    const c = await this.prisma.trainingCourse.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!c) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy khoá đào tạo',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return c;
  }
}
