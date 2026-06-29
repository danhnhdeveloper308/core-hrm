import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { BenefitPlansService } from './benefit-plans.service';
import { BenefitsController } from './benefits.controller';
import { EmployeeBenefitsService } from './employee-benefits.service';
import { EmployeeSalariesController } from './employee-salaries.controller';
import { EmployeeSalariesService } from './employee-salaries.service';
import { PayrollCalcService } from './payroll-calc.service';
import { PayrollCalcWorker } from './payroll-calc.worker';
import { PayrollConfigController } from './payroll-config.controller';
import { PayrollConfigService } from './payroll-config.service';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollRunsController } from './payroll-runs.controller';
import { PayrollRunsService } from './payroll-runs.service';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';
import { SalaryComponentsController } from './salary-components.controller';
import { SalaryComponentsService } from './salary-components.service';

/** P-F — Payroll: cấu hình + cấu phần + lương NV + phúc lợi + kỳ lương + phiếu lương. */
@Module({
  imports: [ApprovalModule],
  controllers: [
    PayrollConfigController,
    SalaryComponentsController,
    EmployeeSalariesController,
    BenefitsController,
    PayrollRunsController,
    PayslipsController,
  ],
  providers: [
    PayrollConfigService,
    SalaryComponentsService,
    EmployeeSalariesService,
    BenefitPlansService,
    EmployeeBenefitsService,
    PayrollEngineService,
    PayrollCalcService,
    PayrollCalcWorker,
    PayrollRunsService,
    PayslipsService,
  ],
  exports: [PayrollConfigService],
})
export class PayrollModule {}
