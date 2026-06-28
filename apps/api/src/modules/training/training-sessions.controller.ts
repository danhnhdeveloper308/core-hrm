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
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateTrainingSessionDto,
  ListTrainingSessionsQueryDto,
  UpdateTrainingSessionDto,
} from './dto/training.dto';
import { TrainingEnrollmentsService } from './training-enrollments.service';
import { TrainingSessionsService } from './training-sessions.service';

@ApiTags('training')
@ApiCookieAuth('access_token')
@Controller('training/sessions')
export class TrainingSessionsController {
  constructor(
    private readonly service: TrainingSessionsService,
    private readonly enrollments: TrainingEnrollmentsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TRAINING_READ)
  @ApiOperation({ summary: 'Danh sách lớp/đợt đào tạo' })
  @ApiOkResponse({ description: 'CursorPaginated<TrainingSessionResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @Query() query: ListTrainingSessionsQueryDto,
  ) {
    return this.service.list(orgId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('training_session.create')
  @ApiOperation({ summary: 'Mở lớp/đợt đào tạo' })
  @ApiOkResponse({ description: 'TrainingSessionResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateTrainingSessionDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('training_session.update')
  @ApiOperation({ summary: 'Cập nhật lớp/đợt đào tạo' })
  @ApiOkResponse({ description: 'TrainingSessionResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrainingSessionDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('training_session.delete')
  @ApiOperation({ summary: 'Xoá lớp/đợt đào tạo' })
  @ApiOkResponse({ description: '{ id }' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(orgId, id);
  }

  @Post(':id/register')
  @RequirePermissions(PERMISSIONS.TRAINING_READ)
  @Audit('training_enrollment.register')
  @ApiOperation({ summary: 'NV tự đăng ký vào lớp' })
  @ApiOkResponse({ description: 'TrainingEnrollmentResponse' })
  register(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enrollments.register(orgId, actor, id);
  }
}
