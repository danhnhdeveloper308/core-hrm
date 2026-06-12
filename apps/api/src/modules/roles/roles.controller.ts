import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateRoleDto,
  ListRolesQueryDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './dto/role.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiCookieAuth('access_token')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @ApiOperation({ summary: 'Danh sách roles (kèm permissions + số user)' })
  @ApiOkResponse({ description: 'Paginated<RoleResponse>' })
  list(@Query() query: ListRolesQueryDto) {
    return this.roles.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @ApiOperation({ summary: 'Chi tiết role' })
  @ApiOkResponse({ description: 'RoleResponse' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROLE_CREATE)
  @Audit('role.create')
  @ApiOperation({ summary: 'Tạo role mới' })
  @ApiOkResponse({ description: 'RoleResponse' })
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLE_UPDATE)
  @Audit('role.update')
  @ApiOperation({ summary: 'Sửa tên/mô tả role (không áp dụng cho role hệ thống)' })
  @ApiOkResponse({ description: 'RoleResponse' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ROLE_DELETE)
  @Audit('role.delete')
  @ApiOperation({ summary: 'Xoá role (không áp dụng cho role hệ thống)' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.remove(id);
  }

  @Put(':id/permissions')
  @RequirePermissions(PERMISSIONS.ROLE_UPDATE)
  @Audit('role.set_permissions')
  @ApiOperation({
    summary: 'Replace toàn bộ permissions của role — cache invalidate ngay',
  })
  @ApiOkResponse({ description: 'RoleResponse' })
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return this.roles.setPermissions(id, dto);
  }
}
