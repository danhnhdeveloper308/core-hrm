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
import { CertificationsService } from './certifications.service';
import {
  CreateCertificationDto,
  ListCertificationsQueryDto,
  UpdateCertificationDto,
} from './dto/training.dto';

@ApiTags('training')
@ApiCookieAuth('access_token')
@Controller('certifications')
export class CertificationsController {
  constructor(private readonly service: CertificationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TRAINING_READ)
  @ApiOperation({ summary: 'Danh sách chứng chỉ (theo phạm vi / mine)' })
  @ApiOkResponse({ description: 'CursorPaginated<CertificationResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: ListCertificationsQueryDto,
  ) {
    return this.service.list(orgId, actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('certification.create')
  @ApiOperation({ summary: 'Cấp / ghi nhận chứng chỉ cho nhân viên' })
  @ApiOkResponse({ description: 'CertificationResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateCertificationDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('certification.update')
  @ApiOperation({ summary: 'Cập nhật chứng chỉ' })
  @ApiOkResponse({ description: 'CertificationResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCertificationDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  @Audit('certification.delete')
  @ApiOperation({ summary: 'Xoá chứng chỉ' })
  @ApiOkResponse({ description: '{ id }' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(orgId, id);
  }
}
