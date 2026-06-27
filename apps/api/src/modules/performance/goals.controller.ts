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
  CreateGoalDto,
  ListGoalsQueryDto,
  UpdateGoalDto,
  UpdateGoalProgressDto,
} from './dto/performance.dto';
import { GoalsService } from './goals.service';

@ApiTags('performance')
@ApiCookieAuth('access_token')
@Controller('goals')
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @ApiOperation({ summary: 'Danh sách mục tiêu (theo phạm vi của tôi)' })
  @ApiOkResponse({ description: 'CursorPaginated<GoalResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: ListGoalsQueryDto,
  ) {
    return this.service.list(orgId, actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @Audit('goal.create')
  @ApiOperation({ summary: 'Tạo mục tiêu (của mình hoặc cấp dưới)' })
  @ApiOkResponse({ description: 'GoalResponse' })
  create(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: CreateGoalDto,
  ) {
    return this.service.create(orgId, actor, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @Audit('goal.update')
  @ApiOperation({ summary: 'Cập nhật mục tiêu' })
  @ApiOkResponse({ description: 'GoalResponse' })
  update(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.service.update(orgId, actor, id, dto);
  }

  @Patch(':id/progress')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @Audit('goal.progress')
  @ApiOperation({ summary: 'Cập nhật tiến độ mục tiêu' })
  @ApiOkResponse({ description: 'GoalResponse' })
  updateProgress(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalProgressDto,
  ) {
    return this.service.updateProgress(orgId, actor, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @Audit('goal.delete')
  @ApiOperation({ summary: 'Xoá mục tiêu' })
  @ApiOkResponse({ description: '{ id }' })
  remove(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(orgId, actor, id);
  }
}
