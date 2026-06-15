import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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
import { AttendanceService } from './attendance.service';
import {
  AttendanceRangeQueryDto,
  CheckInDto,
  CreateCorrectionDto,
  OrgAttendanceQueryDto,
} from './dto/attendance.dto';

@ApiTags('attendance')
@ApiCookieAuth('access_token')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('check')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @Audit('attendance.check')
  @ApiOperation({ summary: 'Check-in/out web (source WEB) — tự suy IN/OUT nếu thiếu' })
  @ApiOkResponse({ description: 'AttendanceLogResponse' })
  check(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: CheckInDto,
  ) {
    return this.attendance.check(orgId, actor, dto);
  }

  @Get('me')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Log + timesheet của chính mình trong khoảng ngày' })
  @ApiOkResponse({ description: '{ logs, timesheet }' })
  me(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: AttendanceRangeQueryDto,
  ) {
    return this.attendance.myAttendance(orgId, actor, query.from, query.to);
  }

  @Get('me/today')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Log hôm nay của chính mình (trang /checkin)' })
  @ApiOkResponse({ description: '{ logs, serverTime }' })
  today(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendance.myToday(orgId, actor);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ_ALL)
  @ApiOperation({ summary: 'HR/manager xem chấm công 1 nhân viên (scope subtree)' })
  @ApiOkResponse({ description: '{ logs, timesheet }' })
  org(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: OrgAttendanceQueryDto,
  ) {
    return this.attendance.orgAttendance(orgId, actor, query);
  }

  @Get('grid')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ_ALL)
  @ApiOperation({ summary: 'Lưới công tháng (employee × ngày) cho AG Grid' })
  @ApiOkResponse({ description: 'TimesheetGridRow[]' })
  grid(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: OrgAttendanceQueryDto,
  ) {
    return this.attendance.timesheetGrid(orgId, actor, query);
  }

  @Post('corrections')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_CORRECT)
  @Audit('attendance.correction')
  @ApiOperation({
    summary: 'Sửa công thủ công — Phase 4 áp dụng ngay (Phase 8 qua Approval)',
  })
  @ApiOkResponse({ description: 'TimesheetDayResponse' })
  correction(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: CreateCorrectionDto,
  ) {
    return this.attendance.createCorrection(orgId, actor, dto);
  }
}
