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
import { BenefitPlansService } from './benefit-plans.service';
import {
  CreateBenefitPlanDto,
  CreateEmployeeBenefitDto,
  ListBenefitPlansQueryDto,
  ListEmployeeBenefitsQueryDto,
  UpdateBenefitPlanDto,
} from './dto/payroll.dto';
import { EmployeeBenefitsService } from './employee-benefits.service';

@ApiTags('payroll')
@ApiCookieAuth('access_token')
@Controller('benefits')
export class BenefitsController {
  constructor(
    private readonly plans: BenefitPlansService,
    private readonly assignments: EmployeeBenefitsService,
  ) {}

  // ===== Plans =====

  @Get('plans')
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Danh sách phúc lợi (catalog)' })
  @ApiOkResponse({ description: 'CursorPaginated<BenefitPlanResponse>' })
  listPlans(
    @CurrentOrg() orgId: string,
    @Query() query: ListBenefitPlansQueryDto,
  ) {
    return this.plans.list(orgId, query);
  }

  @Post('plans')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('benefit_plan.create')
  @ApiOperation({ summary: 'Tạo phúc lợi' })
  @ApiOkResponse({ description: 'BenefitPlanResponse' })
  createPlan(@CurrentOrg() orgId: string, @Body() dto: CreateBenefitPlanDto) {
    return this.plans.create(orgId, dto);
  }

  @Patch('plans/:id')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('benefit_plan.update')
  @ApiOperation({ summary: 'Cập nhật phúc lợi' })
  @ApiOkResponse({ description: 'BenefitPlanResponse' })
  updatePlan(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBenefitPlanDto,
  ) {
    return this.plans.update(orgId, id, dto);
  }

  @Delete('plans/:id')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('benefit_plan.delete')
  @ApiOperation({ summary: 'Xoá phúc lợi' })
  @ApiOkResponse({ description: '{ id }' })
  removePlan(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.remove(orgId, id);
  }

  // ===== Assignments =====

  @Get('assignments')
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Danh sách phúc lợi đã gán cho NV' })
  @ApiOkResponse({ description: 'CursorPaginated<EmployeeBenefitResponse>' })
  listAssignments(
    @CurrentOrg() orgId: string,
    @Query() query: ListEmployeeBenefitsQueryDto,
  ) {
    return this.assignments.list(orgId, query);
  }

  @Post('assignments')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('employee_benefit.create')
  @ApiOperation({ summary: 'Gán phúc lợi cho 1 NV' })
  @ApiOkResponse({ description: 'EmployeeBenefitResponse' })
  createAssignment(
    @CurrentOrg() orgId: string,
    @Body() dto: CreateEmployeeBenefitDto,
  ) {
    return this.assignments.create(orgId, dto);
  }

  @Delete('assignments/:id')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  @Audit('employee_benefit.delete')
  @ApiOperation({ summary: 'Bỏ gán phúc lợi' })
  @ApiOkResponse({ description: '{ id }' })
  removeAssignment(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assignments.remove(orgId, id);
  }
}
