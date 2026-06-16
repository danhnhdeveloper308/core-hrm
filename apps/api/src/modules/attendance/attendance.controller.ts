import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
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
  EditTimesheetDto,
  OrgAttendanceQueryDto,
  RequestCorrectionDto,
  ResetDayDto,
} from './dto/attendance.dto';

@ApiTags('attendance')
@ApiCookieAuth('access_token')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('check')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @Audit('attendance.check')
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Check-in/out — kèm ảnh khuôn mặt + toạ độ nếu worksite yêu cầu',
  })
  @ApiOkResponse({ description: 'AttendanceLogResponse' })
  check(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: CheckInDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.attendance.check(orgId, actor, dto, photo?.buffer);
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

  @Post('corrections/request')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @Audit('attendance.correction_request')
  @ApiOperation({ summary: 'Nhân viên TỰ xin sửa công (qua luồng duyệt)' })
  @ApiOkResponse({ description: '{ id }' })
  requestCorrection(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: RequestCorrectionDto,
  ) {
    return this.attendance.requestCorrection(orgId, actor, dto);
  }

  @Get('corrections/mine')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Đơn sửa công của tôi + trạng thái duyệt' })
  @ApiOkResponse({ description: 'CorrectionRequestResponse[]' })
  myCorrections(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendance.listMyCorrections(orgId, actor.sub);
  }

  @Post('timesheet/recalc')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_CORRECT)
  @Audit('attendance.recalc')
  @ApiOperation({ summary: 'Tính lại bảng công 1 ngày từ log gốc' })
  @ApiOkResponse({ description: 'TimesheetDayResponse | null' })
  recalc(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: ResetDayDto,
  ) {
    return this.attendance.recalcDay(orgId, actor, dto.employeeId, dto.date);
  }

  @Post('timesheet/reset')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_CORRECT)
  @Audit('attendance.reset')
  @ApiOperation({ summary: 'Reset (xóa) công 1 ngày: xóa log + bảng công' })
  @ApiOkResponse({ description: 'TimesheetDayResponse | null' })
  reset(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: ResetDayDto,
  ) {
    return this.attendance.resetDay(orgId, actor, dto.employeeId, dto.date);
  }

  @Patch('timesheet')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_CORRECT)
  @Audit('attendance.edit_timesheet')
  @ApiOperation({
    summary: 'Sửa giờ công thủ công + khóa ngày (chỉ ORG_ADMIN/HR)',
  })
  @ApiOkResponse({ description: 'TimesheetDayResponse' })
  editTimesheet(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: EditTimesheetDto,
  ) {
    return this.attendance.editTimesheet(orgId, actor, dto);
  }
}
