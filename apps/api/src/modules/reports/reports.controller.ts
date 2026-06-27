import { Controller, Get, Query, Res } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@repo/shared';
import type { Response } from 'express';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AttendanceReportQueryDto, OrgChartQueryDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('reports')
@ApiCookieAuth('access_token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @ApiOperation({ summary: 'Số liệu tổng quan dashboard (org)' })
  @ApiOkResponse({ description: 'DashboardStats' })
  dashboard(@CurrentOrg() orgId: string) {
    return this.reports.dashboardStats(orgId);
  }

  @Get('org-chart')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({
    summary: 'Sơ đồ tổ chức (lazy 1 cấp/lần) — theo đơn vị hoặc reporting line',
  })
  @ApiOkResponse({ description: 'OrgChartLevel' })
  orgChart(@CurrentOrg() orgId: string, @Query() query: OrgChartQueryDto) {
    return this.reports.orgChart(orgId, query);
  }

  @Get('attendance.xlsx')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @ApiOperation({ summary: 'Xuất bảng tổng hợp công (XLSX) theo khoảng + đơn vị' })
  async attendanceXlsx(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: AttendanceReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.reports.attendanceSummaryXlsx(orgId, actor, query);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bang-cong-${query.from}_${query.to}.xlsx"`,
    );
    res.send(buf);
  }
}
