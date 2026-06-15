import { Controller, Get } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@repo/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('permissions')
@ApiCookieAuth('access_token')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PERMISSION_READ)
  @ApiOperation({ summary: 'Danh sách toàn bộ permissions (cho ma trận role)' })
  @ApiOkResponse({ description: '[{ id, name, description }]' })
  list() {
    return this.prisma.permission.findMany({ orderBy: { name: 'asc' } });
  }
}
