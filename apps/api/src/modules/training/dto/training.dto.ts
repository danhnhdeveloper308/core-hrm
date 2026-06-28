import {
  createTrainingCourseSchema,
  createTrainingEnrollmentSchema,
  createTrainingSessionSchema,
  listTrainingCoursesQuerySchema,
  listTrainingEnrollmentsQuerySchema,
  listTrainingSessionsQuerySchema,
  updateTrainingCourseSchema,
  updateTrainingEnrollmentSchema,
  updateTrainingSessionSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateTrainingCourseDto extends createZodDto(
  createTrainingCourseSchema,
) {}

export class UpdateTrainingCourseDto extends createZodDto(
  updateTrainingCourseSchema,
) {}

export class ListTrainingCoursesQueryDto extends createZodDto(
  listTrainingCoursesQuerySchema,
) {}

export class CreateTrainingSessionDto extends createZodDto(
  createTrainingSessionSchema,
) {}

export class UpdateTrainingSessionDto extends createZodDto(
  updateTrainingSessionSchema,
) {}

export class ListTrainingSessionsQueryDto extends createZodDto(
  listTrainingSessionsQuerySchema,
) {}

export class CreateTrainingEnrollmentDto extends createZodDto(
  createTrainingEnrollmentSchema,
) {}

export class UpdateTrainingEnrollmentDto extends createZodDto(
  updateTrainingEnrollmentSchema,
) {}

export class ListTrainingEnrollmentsQueryDto extends createZodDto(
  listTrainingEnrollmentsQuerySchema,
) {}
