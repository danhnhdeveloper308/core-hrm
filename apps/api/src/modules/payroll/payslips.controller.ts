import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@repo/shared';
import type { Response } from 'express';
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

  @Get('mine/:id/pdf')
  @RequirePermissions(PERMISSIONS.PAYSLIP_READ_SELF)
  @ApiOperation({ summary: 'Tải PDF phiếu lương của tôi' })
  @ApiProduces('application/pdf')
  async minePdf(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.service.renderMinePdf(orgId, actor, id);
    this.sendPdf(res, buffer, filename);
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

  @Get(':id/pdf')
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Tải PDF phiếu lương (HR)' })
  @ApiProduces('application/pdf')
  async pdf(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.service.renderPdf(orgId, id);
    this.sendPdf(res, buffer, filename);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Phiếu lương (HR — theo kỳ/NV)' })
  @ApiOkResponse({ description: 'CursorPaginated<PayslipResponse>' })
  list(@CurrentOrg() orgId: string, @Query() query: ListPayslipsQueryDto) {
    return this.service.list(orgId, query);
  }

  private sendPdf(res: Response, buffer: Buffer, filename: string): void {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
