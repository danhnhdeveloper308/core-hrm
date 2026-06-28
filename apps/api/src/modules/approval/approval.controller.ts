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
import {
  PERMISSIONS,
  type ApprovalTargetType,
  type Permission,
} from '@repo/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsCacheService } from '../rbac/permissions-cache.service';
import { ApprovalFlowService } from './approval-flow.service';
import { ApprovalService } from './approval.service';
import {
  CreateApprovalFlowDto,
  DecideApprovalDto,
  UpdateApprovalFlowDto,
} from './dto/approval.dto';

/** Quyền "duyệt thay" theo loại đơn. */
const OVERRIDE_PERM: Record<ApprovalTargetType, Permission> = {
  LEAVE: PERMISSIONS.LEAVE_APPROVE,
  ATTENDANCE_CORRECTION: PERMISSIONS.ATTENDANCE_CORRECT,
  OT: PERMISSIONS.ATTENDANCE_CORRECT,
  SHIFT_BATCH: PERMISSIONS.ATTENDANCE_CORRECT,
  MANPOWER_REQUEST: PERMISSIONS.RECRUITMENT_MANAGE,
  OFFER: PERMISSIONS.OFFER_MANAGE,
  PERFORMANCE_REVIEW: PERMISSIONS.REVIEW_CONDUCT,
  TRAINING_ENROLLMENT: PERMISSIONS.TRAINING_MANAGE,
};

@ApiTags('approval-flows')
@ApiCookieAuth('access_token')
@Controller('approval-flows')
export class ApprovalFlowController {
  constructor(private readonly flows: ApprovalFlowService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.APPROVAL_MANAGE_FLOW)
  @ApiOperation({ summary: 'Danh sách luồng duyệt (lọc theo targetType)' })
  @ApiOkResponse({ description: 'ApprovalFlowResponse[]' })
  list(
    @CurrentOrg() orgId: string,
    @Query('targetType') targetType?: ApprovalTargetType,
  ) {
    return this.flows.list(orgId, targetType);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.APPROVAL_MANAGE_FLOW)
  @Audit('approval_flow.create')
  @ApiOperation({ summary: 'Tạo luồng duyệt N cấp' })
  @ApiOkResponse({ description: 'ApprovalFlowResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateApprovalFlowDto) {
    return this.flows.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.APPROVAL_MANAGE_FLOW)
  @Audit('approval_flow.update')
  @ApiOperation({ summary: 'Sửa luồng duyệt (thay toàn bộ bước nếu truyền steps)' })
  @ApiOkResponse({ description: 'ApprovalFlowResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApprovalFlowDto,
  ) {
    return this.flows.update(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.APPROVAL_MANAGE_FLOW)
  @Audit('approval_flow.delete')
  @ApiOperation({ summary: 'Xoá luồng duyệt' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.flows.remove(orgId, id);
  }
}

@ApiTags('approvals')
@ApiCookieAuth('access_token')
@Controller('approvals')
export class ApprovalController {
  constructor(
    private readonly approval: ApprovalService,
    private readonly permsCache: PermissionsCacheService,
  ) {}

  @Get('inbox')
  @ApiOperation({ summary: 'Đơn đang chờ chính tôi duyệt' })
  @ApiOkResponse({ description: 'ApprovalInstanceResponse[]' })
  inbox(@CurrentOrg() orgId: string, @CurrentUser() actor: AccessTokenPayload) {
    return this.approval.inbox(orgId, actor.sub);
  }

  @Get('history')
  @ApiOperation({ summary: 'Đơn tôi đã xử lý (duyệt/từ chối)' })
  @ApiOkResponse({ description: 'ApprovalInstanceResponse[]' })
  history(@CurrentOrg() orgId: string, @CurrentUser() actor: AccessTokenPayload) {
    return this.approval.history(orgId, actor.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một đơn duyệt (chain + ai đã duyệt)' })
  @ApiOkResponse({ description: 'ApprovalInstanceResponse' })
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.approval.getInstance(orgId, id);
  }

  @Post(':id/decide')
  @Audit('approval.decide')
  @ApiOperation({ summary: 'Duyệt / từ chối bước hiện tại (HR có thể duyệt thay)' })
  @ApiOkResponse({ description: 'ApprovalInstanceResponse' })
  async decide(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideApprovalDto,
  ) {
    const instance = await this.approval.getInstance(orgId, id);
    const access = await this.permsCache.getUserAccess(actor.sub);
    const canOverride =
      access?.permissions.includes(OVERRIDE_PERM[instance.targetType]) ?? false;
    return this.approval.decide(
      orgId,
      id,
      actor.sub,
      dto.decision,
      dto.note ?? null,
      canOverride,
    );
  }
}
