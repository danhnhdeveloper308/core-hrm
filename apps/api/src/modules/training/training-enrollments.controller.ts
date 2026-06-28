import {
  Body,
  Controller,
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
  CreateTrainingEnrollmentDto,
  ListTrainingEnrollmentsQueryDto,
  UpdateTrainingEnrollmentDto,
} from './dto/training.dto';
import { TrainingEnrollmentsService } from './training-enrollments.service';

@ApiTags('training')
@ApiCookieAuth('access_token')
@Controller('training/enrollments')
export class TrainingEnrollmentsController {
  constructor(private readonly service: TrainingEnrollmentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TRAINING_READ)
  @ApiOperation({ summary: 'Danh sách đăng ký học (theo phạm vi / mine)' })
  @ApiOkResponse({ description: 'CursorPaginated<TrainingEnrollmentResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: ListTrainingEnrollmentsQueryDto,
  ) {
    return this.service.list(orgId, actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('training_enrollment.create')
  @ApiOperation({ summary: 'HR ghi danh hộ 1 nhân viên' })
  @ApiOkResponse({ description: 'TrainingEnrollmentResponse' })
  createByHr(
    @CurrentOrg() orgId: string,
    @Body() dto: CreateTrainingEnrollmentDto,
  ) {
    return this.service.createByHr(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('training_enrollment.update')
  @ApiOperation({ summary: 'Cập nhật trạng thái / điểm / nhận xét (điểm danh...)' })
  @ApiOkResponse({ description: 'TrainingEnrollmentResponse' })
  update(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrainingEnrollmentDto,
  ) {
    return this.service.update(orgId, actor, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.TRAINING_READ)
  @Audit('training_enrollment.cancel')
  @ApiOperation({ summary: 'Huỷ đăng ký (của chính mình hoặc HR)' })
  @ApiOkResponse({ description: 'TrainingEnrollmentResponse' })
  cancel(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(orgId, actor, id);
  }
}
