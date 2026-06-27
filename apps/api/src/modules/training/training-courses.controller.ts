import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@repo/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateTrainingCourseDto,
  ListTrainingCoursesQueryDto,
  UpdateTrainingCourseDto,
} from './dto/training.dto';
import { TrainingCoursesService } from './training-courses.service';

@ApiTags('training')
@ApiCookieAuth('access_token')
@Controller('training/courses')
export class TrainingCoursesController {
  constructor(private readonly service: TrainingCoursesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TRAINING_READ)
  @ApiOperation({ summary: 'Danh sách khoá đào tạo' })
  @ApiOkResponse({ description: 'CursorPaginated<TrainingCourseResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @Query() query: ListTrainingCoursesQueryDto,
  ) {
    return this.service.list(orgId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('training_course.create')
  @ApiOperation({ summary: 'Tạo khoá đào tạo' })
  @ApiOkResponse({ description: 'TrainingCourseResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateTrainingCourseDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('training_course.update')
  @ApiOperation({ summary: 'Cập nhật khoá đào tạo' })
  @ApiOkResponse({ description: 'TrainingCourseResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrainingCourseDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('training_course.delete')
  @ApiOperation({ summary: 'Xoá khoá đào tạo' })
  @ApiOkResponse({ description: '{ id }' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(orgId, id);
  }
}
