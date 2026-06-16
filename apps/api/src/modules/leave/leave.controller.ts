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
import { LeaveConfigService } from './leave-config.service';
import { LeaveService } from './leave.service';
import {
  AdjustBalanceDto,
  CreateLeavePolicyDto,
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  ListLeaveRequestsQueryDto,
  UpdateLeavePolicyDto,
  UpdateLeaveTypeDto,
} from './dto/leave.dto';

@ApiTags('leave-config')
@ApiCookieAuth('access_token')
@Controller('leave')
export class LeaveConfigController {
  constructor(private readonly config: LeaveConfigService) {}

  @Get('types')
  @RequirePermissions(PERMISSIONS.LEAVE_READ)
  @ApiOperation({ summary: 'Danh sách loại phép' })
  @ApiOkResponse({ description: 'LeaveTypeResponse[]' })
  listTypes(@CurrentOrg() orgId: string) {
    return this.config.listTypes(orgId);
  }

  @Post('types')
  @RequirePermissions(PERMISSIONS.LEAVE_MANAGE_POLICY)
  @Audit('leave.type.create')
  @ApiOperation({ summary: 'Tạo loại phép' })
  @ApiOkResponse({ description: 'LeaveTypeResponse' })
  createType(@CurrentOrg() orgId: string, @Body() dto: CreateLeaveTypeDto) {
    return this.config.createType(orgId, dto);
  }

  @Patch('types/:id')
  @RequirePermissions(PERMISSIONS.LEAVE_MANAGE_POLICY)
  @Audit('leave.type.update')
  @ApiOperation({ summary: 'Sửa loại phép' })
  @ApiOkResponse({ description: 'LeaveTypeResponse' })
  updateType(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.config.updateType(orgId, id, dto);
  }

  @Delete('types/:id')
  @RequirePermissions(PERMISSIONS.LEAVE_MANAGE_POLICY)
  @Audit('leave.type.delete')
  @ApiOperation({ summary: 'Xoá loại phép' })
  @ApiOkResponse({ description: 'Đã xoá' })
  removeType(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.config.removeType(orgId, id);
  }

  @Get('policies')
  @RequirePermissions(PERMISSIONS.LEAVE_MANAGE_POLICY)
  @ApiOperation({ summary: 'Danh sách chính sách phép' })
  @ApiOkResponse({ description: 'LeavePolicyResponse[]' })
  listPolicies(@CurrentOrg() orgId: string) {
    return this.config.listPolicies(orgId);
  }

  @Post('policies')
  @RequirePermissions(PERMISSIONS.LEAVE_MANAGE_POLICY)
  @Audit('leave.policy.create')
  @ApiOperation({ summary: 'Tạo chính sách phép (org default hoặc theo đơn vị)' })
  @ApiOkResponse({ description: 'LeavePolicyResponse' })
  createPolicy(@CurrentOrg() orgId: string, @Body() dto: CreateLeavePolicyDto) {
    return this.config.createPolicy(orgId, dto);
  }

  @Patch('policies/:id')
  @RequirePermissions(PERMISSIONS.LEAVE_MANAGE_POLICY)
  @Audit('leave.policy.update')
  @ApiOperation({ summary: 'Sửa chính sách phép' })
  @ApiOkResponse({ description: 'LeavePolicyResponse' })
  updatePolicy(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeavePolicyDto,
  ) {
    return this.config.updatePolicy(orgId, id, dto);
  }

  @Delete('policies/:id')
  @RequirePermissions(PERMISSIONS.LEAVE_MANAGE_POLICY)
  @Audit('leave.policy.delete')
  @ApiOperation({ summary: 'Xoá chính sách phép' })
  @ApiOkResponse({ description: 'Đã xoá' })
  removePolicy(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.config.removePolicy(orgId, id);
  }
}

@ApiTags('leave')
@ApiCookieAuth('access_token')
@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('balance/me')
  @RequirePermissions(PERMISSIONS.LEAVE_READ)
  @ApiOperation({ summary: 'Số dư phép của tôi theo năm' })
  @ApiOkResponse({ description: 'LeaveBalanceResponse[]' })
  async myBalance(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query('year') year?: string,
  ) {
    return this.leave.balanceForActor(
      orgId,
      actor.sub,
      Number(year) || new Date().getUTCFullYear(),
    );
  }

  @Get('ledger/me')
  @RequirePermissions(PERMISSIONS.LEAVE_READ)
  @ApiOperation({ summary: 'Lịch sử bút toán phép của tôi' })
  @ApiOkResponse({ description: 'LeaveLedgerEntryResponse[]' })
  async myLedger(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query('year') year?: string,
  ) {
    return this.leave.ledgerForActor(
      orgId,
      actor.sub,
      Number(year) || new Date().getUTCFullYear(),
    );
  }

  @Get('balance/:employeeId')
  @RequirePermissions(PERMISSIONS.LEAVE_MANAGE_POLICY)
  @ApiOperation({ summary: 'Số dư phép của 1 nhân viên (HR)' })
  @ApiOkResponse({ description: 'LeaveBalanceResponse[]' })
  employeeBalance(
    @CurrentOrg() orgId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('year') year?: string,
  ) {
    return this.leave.getBalance(orgId, employeeId, Number(year) || new Date().getUTCFullYear());
  }

  @Get('requests')
  @RequirePermissions(PERMISSIONS.LEAVE_READ)
  @ApiOperation({ summary: 'Danh sách đơn nghỉ (scope mine/team/all)' })
  @ApiOkResponse({ description: 'LeaveRequestResponse[]' })
  listRequests(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: ListLeaveRequestsQueryDto,
  ) {
    return this.leave.listRequests(orgId, actor, query);
  }

  @Post('requests')
  @RequirePermissions(PERMISSIONS.LEAVE_REQUEST)
  @Audit('leave.request.create')
  @ApiOperation({ summary: 'Tạo đơn nghỉ phép (vào luồng duyệt)' })
  @ApiOkResponse({ description: 'LeaveRequestResponse' })
  createRequest(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leave.createRequest(orgId, actor, dto);
  }

  @Post('requests/:id/cancel')
  @RequirePermissions(PERMISSIONS.LEAVE_REQUEST)
  @Audit('leave.request.cancel')
  @ApiOperation({ summary: 'Huỷ đơn nghỉ (hoàn phép nếu đã duyệt)' })
  @ApiOkResponse({ description: 'LeaveRequestResponse' })
  cancelRequest(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leave.cancelRequest(orgId, actor, id);
  }

  @Post('adjust')
  @RequirePermissions(PERMISSIONS.LEAVE_MANAGE_POLICY)
  @Audit('leave.adjust')
  @ApiOperation({ summary: 'HR điều chỉnh số dư phép (ADJUSTMENT)' })
  @ApiOkResponse({ description: 'Đã điều chỉnh' })
  adjust(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: AdjustBalanceDto,
  ) {
    return this.leave.adjustBalance(orgId, actor, dto);
  }
}
