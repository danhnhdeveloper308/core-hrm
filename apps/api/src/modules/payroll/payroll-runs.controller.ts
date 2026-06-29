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
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreatePayrollRunDto,
  ListPayrollRunsQueryDto,
  ListPayslipsQueryDto,
} from './dto/payroll.dto';
import { PayrollRunsService } from './payroll-runs.service';
import { PayslipsService } from './payslips.service';

@ApiTags('payroll')
@ApiCookieAuth('access_token')
@Controller('payroll/runs')
export class PayrollRunsController {
  constructor(
    private readonly runs: PayrollRunsService,
    private readonly payslips: PayslipsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Danh sách kỳ lương' })
  @ApiOkResponse({ description: 'CursorPaginated<PayrollRunResponse>' })
  list(@CurrentOrg() orgId: string, @Query() query: ListPayrollRunsQueryDto) {
    return this.runs.list(orgId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Chi tiết kỳ lương' })
  @ApiOkResponse({ description: 'PayrollRunResponse' })
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.get(orgId, id);
  }

  @Get(':id/payslips')
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Phiếu lương trong kỳ' })
  @ApiOkResponse({ description: 'CursorPaginated<PayslipResponse>' })
  payslipsOfRun(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListPayslipsQueryDto,
  ) {
    return this.payslips.list(orgId, { ...query, runId: id });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('payroll_run.create')
  @ApiOperation({ summary: 'Tạo kỳ lương (tháng)' })
  @ApiOkResponse({ description: 'PayrollRunResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreatePayrollRunDto) {
    return this.runs.create(orgId, dto);
  }

  @Post(':id/calculate')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('payroll_run.calculate')
  @ApiOperation({ summary: 'Tính lương hàng loạt (BullMQ)' })
  @ApiOkResponse({ description: 'PayrollRunResponse' })
  calculate(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.calculate(orgId, id);
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('payroll_run.submit')
  @ApiOperation({ summary: 'Gửi duyệt kỳ lương' })
  @ApiOkResponse({ description: 'PayrollRunResponse' })
  submit(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runs.submit(orgId, actor, id);
  }

  @Post(':id/pay')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('payroll_run.pay')
  @ApiOperation({ summary: 'Chốt chi lương (khoá kỳ)' })
  @ApiOkResponse({ description: 'PayrollRunResponse' })
  pay(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.pay(orgId, id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('payroll_run.delete')
  @ApiOperation({ summary: 'Xoá kỳ lương (chưa duyệt)' })
  @ApiOkResponse({ description: '{ id }' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.remove(orgId, id);
  }
}
