import { Body, Controller, Get, Patch } from '@nestjs/common';
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
import { UpdatePayrollConfigDto } from './dto/payroll.dto';
import { PayrollConfigService } from './payroll-config.service';

@ApiTags('payroll')
@ApiCookieAuth('access_token')
@Controller('payroll/config')
export class PayrollConfigController {
  constructor(private readonly service: PayrollConfigService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Cấu hình lương/thuế/BH (tự tạo mặc định VN)' })
  @ApiOkResponse({ description: 'PayrollConfigResponse' })
  get(@CurrentOrg() orgId: string) {
    return this.service.get(orgId);
  }

  @Patch()
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('payroll_config.update')
  @ApiOperation({ summary: 'Cập nhật cấu hình lương/thuế/BH' })
  @ApiOkResponse({ description: 'PayrollConfigResponse' })
  update(@CurrentOrg() orgId: string, @Body() dto: UpdatePayrollConfigDto) {
    return this.service.update(orgId, dto);
  }
}
