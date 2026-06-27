import {
  Body,
  Controller,
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
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ApplicationsService } from './applications.service';
import {
  CreateApplicationDto,
  ListApplicationsQueryDto,
  UpdateApplicationStageDto,
} from './dto/recruitment.dto';

@ApiTags('recruitment')
@ApiCookieAuth('access_token')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Danh sách hồ sơ ứng tuyển (cho Kanban)' })
  @ApiOkResponse({ description: 'CursorPaginated<ApplicationResponse>' })
  list(@CurrentOrg() orgId: string, @Query() query: ListApplicationsQueryDto) {
    return this.service.list(orgId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('application.create')
  @ApiOperation({ summary: 'Thêm ứng viên vào tin (tạo hồ sơ ứng tuyển)' })
  @ApiOkResponse({ description: 'ApplicationResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateApplicationDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id/stage')
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('application.update_stage')
  @ApiOperation({ summary: 'Chuyển stage hồ sơ (kéo Kanban)' })
  @ApiOkResponse({ description: 'ApplicationResponse' })
  updateStage(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStageDto,
  ) {
    return this.service.updateStage(orgId, id, dto);
  }
}
