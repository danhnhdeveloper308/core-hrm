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
import { CalendarsService } from './calendars.service';
import {
  AssignShiftDto,
  CreateHolidayCalendarDto,
  CreateHolidayDto,
  UpdateHolidayDto,
  CreateWorkShiftDto,
  UpdateScheduleDefaultsDto,
  UpdateWorkShiftDto,
} from './dto/schedule.dto';
import { ShiftsService } from './shifts.service';

@ApiTags('shifts')
@ApiCookieAuth('access_token')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Danh sách ca làm việc' })
  @ApiOkResponse({ description: 'WorkShiftResponse[]' })
  list(@CurrentOrg() orgId: string) {
    return this.shifts.list(orgId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('shift.create')
  @ApiOperation({ summary: 'Tạo ca làm việc' })
  @ApiOkResponse({ description: 'WorkShiftResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateWorkShiftDto) {
    return this.shifts.create(orgId, dto);
  }

  @Post('assign')
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('shift.assign')
  @ApiOperation({
    summary: 'Gán ca cho 1 nhân viên hoặc cả OrgUnit subtree (effectiveFrom)',
  })
  @ApiOkResponse({ description: '{ assigned: số nhân viên }' })
  assign(@CurrentOrg() orgId: string, @Body() dto: AssignShiftDto) {
    return this.shifts.assign(orgId, dto);
  }

  @Get('assignments')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({ summary: 'Lịch sử gán ca của 1 nhân viên' })
  @ApiOkResponse({ description: 'ShiftAssignmentResponse[]' })
  assignments(
    @CurrentOrg() orgId: string,
    @Query('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.shifts.listAssignments(orgId, employeeId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('shift.update')
  @ApiOperation({ summary: 'Sửa ca làm việc' })
  @ApiOkResponse({ description: 'WorkShiftResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkShiftDto,
  ) {
    return this.shifts.update(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('shift.delete')
  @ApiOperation({ summary: 'Xoá ca làm việc' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.remove(orgId, id);
  }
}

@ApiTags('holiday-calendars')
@ApiCookieAuth('access_token')
@Controller('holiday-calendars')
export class HolidayCalendarsController {
  constructor(private readonly calendars: CalendarsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Danh sách lịch nghỉ lễ' })
  @ApiOkResponse({ description: 'HolidayCalendarResponse[]' })
  list(@CurrentOrg() orgId: string) {
    return this.calendars.list(orgId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('holiday_calendar.create')
  @ApiOperation({ summary: 'Tạo lịch nghỉ lễ' })
  @ApiOkResponse({ description: 'HolidayCalendarResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateHolidayCalendarDto) {
    return this.calendars.create(orgId, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('holiday_calendar.delete')
  @ApiOperation({ summary: 'Xoá lịch nghỉ lễ' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.calendars.remove(orgId, id);
  }

  @Get(':id/holidays')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Danh sách ngày lễ trong lịch' })
  @ApiOkResponse({ description: 'HolidayResponse[]' })
  listHolidays(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.calendars.listHolidays(orgId, id);
  }

  @Post(':id/holidays')
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('holiday.create')
  @ApiOperation({ summary: 'Thêm kỳ nghỉ lễ (khoảng từ–đến, vd nghỉ Tết 7 ngày)' })
  @ApiOkResponse({ description: 'HolidayResponse' })
  addHoliday(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateHolidayDto,
  ) {
    return this.calendars.addHoliday(orgId, id, dto);
  }

  @Patch(':id/holidays/:holidayId')
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('holiday.update')
  @ApiOperation({ summary: 'Sửa kỳ nghỉ lễ (tên / khoảng ngày)' })
  @ApiOkResponse({ description: 'HolidayResponse' })
  updateHoliday(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('holidayId', ParseUUIDPipe) holidayId: string,
    @Body() dto: UpdateHolidayDto,
  ) {
    return this.calendars.updateHoliday(orgId, id, holidayId, dto);
  }

  @Delete(':id/holidays/:holidayId')
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('holiday.delete')
  @ApiOperation({ summary: 'Xoá ngày lễ' })
  @ApiOkResponse({ description: 'Đã xoá' })
  removeHoliday(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('holidayId', ParseUUIDPipe) holidayId: string,
  ) {
    return this.calendars.removeHoliday(orgId, id, holidayId);
  }
}

@ApiTags('schedule')
@ApiCookieAuth('access_token')
@Controller('schedule')
export class ScheduleDefaultsController {
  constructor(private readonly calendars: CalendarsService) {}

  @Patch('org-defaults')
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('schedule.org_defaults')
  @ApiOperation({ summary: 'Đặt ca + lịch lễ mặc định toàn org' })
  @ApiOkResponse({ description: 'Đã cập nhật' })
  orgDefaults(@CurrentOrg() orgId: string, @Body() dto: UpdateScheduleDefaultsDto) {
    return this.calendars.updateOrgDefaults(orgId, dto);
  }

  @Patch('unit-defaults/:unitId')
  @RequirePermissions(PERMISSIONS.SHIFT_MANAGE)
  @Audit('schedule.unit_defaults')
  @ApiOperation({
    summary: 'Đặt ca + lịch lễ cho OrgUnit — đơn vị con kế thừa theo cây',
  })
  @ApiOkResponse({ description: 'Đã cập nhật' })
  unitDefaults(
    @CurrentOrg() orgId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: UpdateScheduleDefaultsDto,
  ) {
    return this.calendars.updateUnitDefaults(orgId, unitId, dto);
  }
}
