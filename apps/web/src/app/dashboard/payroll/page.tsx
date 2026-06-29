'use client';

import { PERMISSIONS } from '@repo/shared';
import { PermissionGate } from '@/components/permission-gate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BenefitsTab } from './benefits-tab';
import { ComponentsTab } from './components-tab';
import { ConfigTab } from './config-tab';
import { SalariesTab } from './salaries-tab';

export default function PayrollPage() {
  return (
    <PermissionGate
      permission={PERMISSIONS.PAYROLL_READ}
      fallback={
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem lương.
        </p>
      }
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Tiền lương</h1>
          <p className="text-sm text-muted-foreground">
            Lương nhân viên, cấu phần lương và cấu hình thuế / bảo hiểm.
          </p>
        </div>

        <Tabs defaultValue="salaries">
          <TabsList>
            <TabsTrigger value="salaries">Lương nhân viên</TabsTrigger>
            <TabsTrigger value="components">Cấu phần</TabsTrigger>
            <TabsTrigger value="benefits">Phúc lợi</TabsTrigger>
            <TabsTrigger value="config">Cấu hình</TabsTrigger>
          </TabsList>
          <TabsContent value="salaries" className="mt-4">
            <SalariesTab />
          </TabsContent>
          <TabsContent value="components" className="mt-4">
            <ComponentsTab />
          </TabsContent>
          <TabsContent value="benefits" className="mt-4">
            <BenefitsTab />
          </TabsContent>
          <TabsContent value="config" className="mt-4">
            <ConfigTab />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
