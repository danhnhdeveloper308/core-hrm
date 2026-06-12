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
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AssignRolesDto,
  InviteUserDto,
  ListUsersQueryDto,
  UpdateProfileDto,
  UpdateUserStatusDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth('access_token')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Danh sách user — search/sort/filter/pagination' })
  @ApiOkResponse({ description: 'Paginated<UserResponse>' })
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Post('invite')
  @RequirePermissions(PERMISSIONS.USER_CREATE)
  @Audit('user.invite')
  @ApiOperation({ summary: 'Mời user qua email — link đặt mật khẩu hết hạn 7 ngày' })
  @ApiOkResponse({ description: 'UserResponse (chưa kích hoạt)' })
  invite(
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: InviteUserDto,
  ) {
    return this.users.invite(actor, dto);
  }

  @Patch('me')
  @Audit('user.update_profile')
  @ApiOperation({ summary: 'Tự cập nhật profile (tên, avatar)' })
  @ApiOkResponse({ description: 'UserResponse' })
  updateProfile(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Chi tiết user' })
  @ApiOkResponse({ description: 'UserResponse' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  @Audit('user.update_status')
  @ApiOperation({
    summary: 'Đổi trạng thái — BAN revoke toàn bộ session + force:logout',
  })
  @ApiOkResponse({ description: 'UserResponse' })
  updateStatus(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.users.updateStatus(actor, id, dto);
  }

  @Put(':id/roles')
  @RequirePermissions(PERMISSIONS.ROLE_ASSIGN)
  @Audit('user.assign_roles')
  @ApiOperation({ summary: 'Replace toàn bộ roles của user — cache invalidate ngay' })
  @ApiOkResponse({ description: 'UserResponse' })
  assignRoles(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
  ) {
    return this.users.assignRoles(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USER_DELETE)
  @Audit('user.delete')
  @ApiOperation({ summary: 'Xoá user (không cho tự xoá / xoá SUPER_ADMIN cuối)' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.remove(actor, id);
  }
}
