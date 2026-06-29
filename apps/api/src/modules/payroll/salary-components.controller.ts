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
  CreateSalaryComponentDto,
  ListSalaryComponentsQueryDto,
  UpdateSalaryComponentDto,
} from './dto/payroll.dto';
import { SalaryComponentsService } from './salary-components.service';

@ApiTags('payroll')
@ApiCookieAuth('access_token')
@Controller('salary-components')
export class SalaryComponentsController {
  constructor(private readonly service: SalaryComponentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Danh sách cấu phần lương' })
  @ApiOkResponse({ description: 'CursorPaginated<SalaryComponentResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @Query() query: ListSalaryComponentsQueryDto,
  ) {
    return this.service.list(orgId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('salary_component.create')
  @ApiOperation({ summary: 'Tạo cấu phần lương' })
  @ApiOkResponse({ description: 'SalaryComponentResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateSalaryComponentDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('salary_component.update')
  @ApiOperation({ summary: 'Cập nhật cấu phần lương' })
  @ApiOkResponse({ description: 'SalaryComponentResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalaryComponentDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('salary_component.delete')
  @ApiOperation({ summary: 'Xoá cấu phần lương' })
  @ApiOkResponse({ description: '{ id }' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(orgId, id);
  }
}
