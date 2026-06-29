import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@repo/shared';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ListPayslipsQueryDto } from './dto/payroll.dto';
import { PayslipsService } from './payslips.service';

@ApiTags('payroll')
@ApiCookieAuth('access_token')
@Controller('payslips')
export class PayslipsController {
  constructor(private readonly service: PayslipsService) {}

  @Get('mine')
  @RequirePermissions(PERMISSIONS.PAYSLIP_READ_SELF)
  @ApiOperation({ summary: 'Phiếu lương của tôi (kỳ đã duyệt/chi)' })
  @ApiOkResponse({ description: 'CursorPaginated<PayslipResponse>' })
  mine(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: ListPayslipsQueryDto,
  ) {
    return this.service.listMine(orgId, actor, query);
  }

  @Get('mine/:id')
  @RequirePermissions(PERMISSIONS.PAYSLIP_READ_SELF)
  @ApiOperation({ summary: 'Chi tiết 1 phiếu lương của tôi' })
  @ApiOkResponse({ description: 'PayslipResponse' })
  mineDetail(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getMine(orgId, actor, id);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Phiếu lương (HR — theo kỳ/NV)' })
  @ApiOkResponse({ description: 'CursorPaginated<PayslipResponse>' })
  list(@CurrentOrg() orgId: string, @Query() query: ListPayslipsQueryDto) {
    return this.service.list(orgId, query);
  }
}
