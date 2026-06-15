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
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateOrganizationDto,
  ListOrganizationsQueryDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

/** Platform admin (orgId=null) quản lý tenant — không đụng dữ liệu nghiệp vụ. */
@ApiTags('organizations')
@ApiCookieAuth('access_token')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_CREATE)
  @ApiOperation({ summary: 'Danh sách tổ chức (platform admin)' })
  @ApiOkResponse({ description: 'Paginated<OrganizationResponse>' })
  list(@Query() query: ListOrganizationsQueryDto) {
    return this.orgs.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORG_CREATE)
  @Audit('organization.create')
  @ApiOperation({
    summary: 'Tạo tổ chức: preset cơ cấu + unit gốc + 4 role org + mời admin',
  })
  @ApiOkResponse({ description: 'OrganizationResponse' })
  create(
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.orgs.create(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORG_CREATE)
  @ApiOperation({ summary: 'Chi tiết tổ chức (platform admin)' })
  @ApiOkResponse({ description: 'OrganizationResponse' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORG_CREATE)
  @Audit('organization.update')
  @ApiOperation({ summary: 'Sửa tên/timezone/trạng thái tổ chức' })
  @ApiOkResponse({ description: 'OrganizationResponse' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.orgs.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ORG_DELETE)
  @Audit('organization.delete')
  @ApiOperation({ summary: 'Xoá tổ chức — cascade toàn bộ dữ liệu tenant' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.remove(id);
  }
}
