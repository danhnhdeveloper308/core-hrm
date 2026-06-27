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
  CreateOtPolicyDto,
  OvertimeSummaryQueryDto,
  UpdateOtPolicyDto,
} from './dto/overtime.dto';
import { OvertimeService } from './overtime.service';

@ApiTags('overtime')
@ApiCookieAuth('access_token')
@Controller('overtime')
export class OvertimeController {
  constructor(private readonly overtime: OvertimeService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ_ALL)
  @ApiOperation({
    summary: 'Tổng hợp giờ OT theo tháng/đơn vị + cảnh báo vượt trần',
  })
  @ApiOkResponse({ description: 'OvertimeSummary' })
  summary(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: OvertimeSummaryQueryDto,
  ) {
    return this.overtime.summary(orgId, actor, query);
  }

  @Get('policies')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ_ALL)
  @ApiOperation({ summary: 'Danh sách trần OT (org default + override đơn vị)' })
  @ApiOkResponse({ description: 'OtPolicyResponse[]' })
  listPolicies(@CurrentOrg() orgId: string) {
    return this.overtime.listPolicies(orgId);
  }

  @Post('policies')
  @RequirePermissions(PERMISSIONS.OVERTIME_MANAGE)
  @Audit('overtime.policy.create')
  @ApiOperation({ summary: 'Tạo trần OT (org default hoặc theo đơn vị)' })
  @ApiOkResponse({ description: 'OtPolicyResponse' })
  createPolicy(@CurrentOrg() orgId: string, @Body() dto: CreateOtPolicyDto) {
    return this.overtime.createPolicy(orgId, dto);
  }

  @Patch('policies/:id')
  @RequirePermissions(PERMISSIONS.OVERTIME_MANAGE)
  @Audit('overtime.policy.update')
  @ApiOperation({ summary: 'Cập nhật trần OT' })
  @ApiOkResponse({ description: 'OtPolicyResponse' })
  updatePolicy(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOtPolicyDto,
  ) {
    return this.overtime.updatePolicy(orgId, id, dto);
  }

  @Delete('policies/:id')
  @RequirePermissions(PERMISSIONS.OVERTIME_MANAGE)
  @Audit('overtime.policy.delete')
  @ApiOperation({ summary: 'Xoá trần OT' })
  @ApiOkResponse({ description: '{ message }' })
  removePolicy(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.overtime.removePolicy(orgId, id);
  }
}
