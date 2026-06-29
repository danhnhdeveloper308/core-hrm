import { Module } from '@nestjs/common';
import { EmployeeSalariesController } from './employee-salaries.controller';
import { EmployeeSalariesService } from './employee-salaries.service';
import { PayrollConfigController } from './payroll-config.controller';
import { PayrollConfigService } from './payroll-config.service';
import { SalaryComponentsController } from './salary-components.controller';
import { SalaryComponentsService } from './salary-components.service';

/** P-F — Payroll: cấu hình + cấu phần + lương NV (+ phúc lợi + kỳ lương dần). */
@Module({
  controllers: [
    PayrollConfigController,
    SalaryComponentsController,
    EmployeeSalariesController,
  ],
  providers: [
    PayrollConfigService,
    SalaryComponentsService,
    EmployeeSalariesService,
  ],
  exports: [PayrollConfigService],
})
export class PayrollModule {}
