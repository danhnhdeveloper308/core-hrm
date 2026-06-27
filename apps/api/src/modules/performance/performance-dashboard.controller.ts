import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@repo/shared';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PerformanceDashboardQueryDto } from './dto/performance.dto';
import { PerformanceDashboardService } from './performance-dashboard.service';

@ApiTags('performance')
@ApiCookieAuth('access_token')
@Controller('performance-reports')
export class PerformanceDashboardController {
  constructor(private readonly service: PerformanceDashboardService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @ApiOperation({ summary: 'KPI Dashboard tổng hợp theo chu kỳ (phạm vi)' })
  @ApiOkResponse({ description: 'PerformanceDashboard' })
  dashboard(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: PerformanceDashboardQueryDto,
  ) {
    return this.service.dashboard(orgId, actor, query);
  }
}
