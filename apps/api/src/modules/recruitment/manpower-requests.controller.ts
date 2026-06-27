import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
  CreateManpowerRequestDto,
  ListManpowerRequestsQueryDto,
} from './dto/recruitment.dto';
import { ManpowerRequestsService } from './manpower-requests.service';

@ApiTags('recruitment')
@ApiCookieAuth('access_token')
@Controller('manpower-requests')
export class ManpowerRequestsController {
  constructor(private readonly service: ManpowerRequestsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Danh sách yêu cầu tuyển dụng' })
  @ApiOkResponse({ description: 'CursorPaginated<ManpowerRequestResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @Query() query: ListManpowerRequestsQueryDto,
  ) {
    return this.service.list(orgId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Chi tiết yêu cầu tuyển dụng' })
  @ApiOkResponse({ description: 'ManpowerRequestResponse' })
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(orgId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('manpower_request.create')
  @ApiOperation({ summary: 'Tạo yêu cầu tuyển dụng (gửi duyệt)' })
  @ApiOkResponse({ description: 'ManpowerRequestResponse' })
  create(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: CreateManpowerRequestDto,
  ) {
    return this.service.create(orgId, actor, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('manpower_request.cancel')
  @ApiOperation({ summary: 'Huỷ yêu cầu tuyển dụng (khi đang chờ duyệt)' })
  @ApiOkResponse({ description: 'ManpowerRequestResponse' })
  cancel(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(orgId, id);
  }
}
