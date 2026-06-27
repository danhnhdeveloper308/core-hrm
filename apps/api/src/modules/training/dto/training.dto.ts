import {
  createTrainingCourseSchema,
  listTrainingCoursesQuerySchema,
  updateTrainingCourseSchema,
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
