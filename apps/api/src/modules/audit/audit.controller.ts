import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@repo/shared';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit.dto';

@ApiTags('audit')
@ApiCookieAuth('access_token')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({
    summary: 'Audit log — cursor pagination, filter actor/resource/action/thời gian',
  })
  @ApiOkResponse({ description: 'CursorPaginated<AuditLog>' })
  list(@Query() query: AuditQueryDto, @CurrentUser() actor: AccessTokenPayload) {
    // Org user chỉ thấy log org mình; platform admin (orgId=null) thấy tất cả.
    return this.audit.list(query, actor.orgId);
  }
}
