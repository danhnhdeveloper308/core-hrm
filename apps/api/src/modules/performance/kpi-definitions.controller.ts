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
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateKpiDefinitionDto,
  ListKpiDefinitionsQueryDto,
  UpdateKpiDefinitionDto,
} from './dto/performance.dto';
import { KpiDefinitionsService } from './kpi-definitions.service';

@ApiTags('performance')
@ApiCookieAuth('access_token')
@Controller('kpi-definitions')
export class KpiDefinitionsController {
  constructor(private readonly service: KpiDefinitionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @ApiOperation({ summary: 'Danh sách KPI (thư viện)' })
  @ApiOkResponse({ description: 'CursorPaginated<KpiDefinitionResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @Query() query: ListKpiDefinitionsQueryDto,
  ) {
    return this.service.list(orgId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PERFORMANCE_MANAGE)
  @Audit('kpi_definition.create')
  @ApiOperation({ summary: 'Tạo KPI mới' })
  @ApiOkResponse({ description: 'KpiDefinitionResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateKpiDefinitionDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_MANAGE)
  @Audit('kpi_definition.update')
  @ApiOperation({ summary: 'Cập nhật KPI' })
  @ApiOkResponse({ description: 'KpiDefinitionResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKpiDefinitionDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_MANAGE)
  @Audit('kpi_definition.delete')
  @ApiOperation({ summary: 'Xoá KPI khỏi thư viện' })
  @ApiOkResponse({ description: '{ id }' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(orgId, id);
  }
}
