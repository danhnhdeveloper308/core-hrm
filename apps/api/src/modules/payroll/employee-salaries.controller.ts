import {
  Body,
  Controller,
  Delete,
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
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateEmployeeSalaryDto,
  ListEmployeeSalariesQueryDto,
} from './dto/payroll.dto';
import { EmployeeSalariesService } from './employee-salaries.service';

@ApiTags('payroll')
@ApiCookieAuth('access_token')
@Controller('employee-salaries')
export class EmployeeSalariesController {
  constructor(private readonly service: EmployeeSalariesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Lương theo NV (mới nhất mỗi NV / lịch sử 1 NV)' })
  @ApiOkResponse({ description: 'CursorPaginated<EmployeeSalaryResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @Query() query: ListEmployeeSalariesQueryDto,
  ) {
    return this.service.list(orgId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('employee_salary.create')
  @ApiOperation({ summary: 'Lưu bản lương (versioned theo ngày hiệu lực)' })
  @ApiOkResponse({ description: 'EmployeeSalaryResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateEmployeeSalaryDto) {
    return this.service.create(orgId, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('employee_salary.delete')
  @ApiOperation({ summary: 'Xoá 1 bản lương' })
  @ApiOkResponse({ description: '{ id }' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(orgId, id);
  }
}
