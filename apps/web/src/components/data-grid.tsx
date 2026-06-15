'use client';

/**
 * Wrapper AG Grid Community dùng chung: theme Quartz sync dark mode, đăng ký
 * module 1 lần. Mọi bảng dữ liệu danh sách dùng component này (per spec 2.12).
 * KHÔNG dùng tính năng Enterprise (row grouping/pivot).
 */
import {
  AllCommunityModule,
  ModuleRegistry,
  colorSchemeDarkBlue,
  themeQuartz,
} from 'ag-grid-community';
import { AgGridReact, type AgGridReactProps } from 'ag-grid-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

ModuleRegistry.registerModules([AllCommunityModule]);

const lightTheme = themeQuartz;
const darkTheme = themeQuartz.withPart(colorSchemeDarkBlue);

interface DataGridProps<T> extends AgGridReactProps<T> {
  /** Class cho container — đặt chiều cao ở đây (vd "h-[560px]"). */
  containerClassName?: string;
}

export function DataGrid<T>({ containerClassName, ...props }: DataGridProps<T>) {
  const { resolvedTheme } = useTheme();
  return (
    <div className={cn('w-full', containerClassName)}>
      <AgGridReact<T>
        theme={resolvedTheme === 'dark' ? darkTheme : lightTheme}
        suppressCellFocus
        {...props}
      />
    </div>
  );
}
