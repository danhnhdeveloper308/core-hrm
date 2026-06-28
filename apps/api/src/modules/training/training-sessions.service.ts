import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateTrainingSessionInput,
  type CursorPaginated,
  type ListTrainingSessionsQuery,
  type TrainingEnrollmentStatus,
  type TrainingSessionResponse,
  type UpdateTrainingSessionInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Đăng ký còn "chiếm chỗ" (chưa huỷ / vắng). */
const ACTIVE_ENROLL_STATUSES: TrainingEnrollmentStatus[] = [
  'REGISTERED',
  'CONFIRMED',
  'ATTENDED',
  'COMPLETED',
];

const INCLUDE = {
  course: { select: { title: true } },
  trainer: { select: { fullName: true } },
  _count: {
    select: { enrollments: { where: { status: { in: ACTIVE_ENROLL_STATUSES } } } },
  },
} as const;

type SessionRow = Prisma.TrainingSessionGetPayload<{ include: typeof INCLUDE }>;

function toResponse(s: SessionRow): TrainingSessionResponse {
  return {
    id: s.id,
    courseId: s.courseId,
    courseTitle: s.course?.title ?? null,
    title: s.title,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt?.toISOString() ?? null,
    location: s.location,
    link: s.link,
    trainerEmployeeId: s.trainerEmployeeId,
    trainerName: s.trainer?.fullName ?? null,
    capacity: s.capacity,
    status: s.status,
    enrolledCount: s._count.enrollments,
    createdAt: s.createdAt.toISOString(),
  };
}

/** Lớp/đợt đào tạo. NV đăng ký qua TrainingEnrollmentsService. */
@Injectable()
export class TrainingSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    orgId: string,
    query: ListTrainingSessionsQuery,
  ): Promise<CursorPaginated<TrainingSessionResponse>> {
    const where: Prisma.TrainingSessionWhereInput = {
      orgId,
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const rows = await this.prisma.trainingSession.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
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
    input: CreateTrainingSessionInput,
  ): Promise<TrainingSessionResponse> {
    const course = await this.prisma.trainingCourse.findFirst({
      where: { id: input.courseId, orgId },
      select: { id: true },
    });
    if (!course) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Khoá đào tạo không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    if (input.trainerEmployeeId) {
      await this.assertTrainer(orgId, input.trainerEmployeeId);
    }
    const created = await this.prisma.trainingSession.create({
      data: {
        orgId,
        courseId: input.courseId,
        title: input.title ?? null,
        startAt: new Date(input.startAt),
        endAt: input.endAt ? new Date(input.endAt) : null,
        location: input.location ?? null,
        link: input.link ?? null,
        trainerEmployeeId: input.trainerEmployeeId ?? null,
        capacity: input.capacity ?? null,
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { courseId: input.courseId, startAt: input.startAt } });
    return toResponse(created);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateTrainingSessionInput,
  ): Promise<TrainingSessionResponse> {
    await this.require(orgId, id);
    if (input.trainerEmployeeId) {
      await this.assertTrainer(orgId, input.trainerEmployeeId);
    }
    const updated = await this.prisma.trainingSession.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.startAt !== undefined
          ? { startAt: new Date(input.startAt) }
          : {}),
        ...(input.endAt !== undefined
          ? { endAt: input.endAt ? new Date(input.endAt) : null }
          : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.link !== undefined ? { link: input.link } : {}),
        ...(input.trainerEmployeeId !== undefined
          ? { trainerEmployeeId: input.trainerEmployeeId }
          : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: INCLUDE,
    });
    addAuditMetadata({ after: { status: updated.status } });
    return toResponse(updated);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    await this.require(orgId, id);
    await this.prisma.trainingSession.delete({ where: { id } });
    addAuditMetadata({ before: { id } });
    return { id };
  }

  private async require(orgId: string, id: string): Promise<SessionRow> {
    const s = await this.prisma.trainingSession.findFirst({
      where: { id, orgId },
      include: INCLUDE,
    });
    if (!s) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy lớp đào tạo',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return s;
  }

  private async assertTrainer(orgId: string, employeeId: string): Promise<void> {
    const e = await this.prisma.employee.findFirst({
      where: { id: employeeId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!e) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Giảng viên không hợp lệ',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
  }
}
