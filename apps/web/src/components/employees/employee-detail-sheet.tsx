'use client';

import {
  PERMISSIONS,
  type ContractResponse,
  type EmployeeResponse,
  type ShiftAssignmentResponse,
  type WorkShiftResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { initials } from '@/lib/format';

type EmployeeDetail = EmployeeResponse & { contracts: ContractResponse[] };

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Chính thức',
  PROBATION: 'Thử việc',
  INACTIVE: 'Tạm nghỉ',
  TERMINATED: 'Đã nghỉ việc',
};

const CONTRACT_LABELS: Record<string, string> = {
  PROBATION: 'Thử việc',
  FIXED_TERM: 'Xác định thời hạn',
  INDEFINITE: 'Không xác định thời hạn',
};

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? '—'}</span>
    </div>
  );
}

interface EmployeeDetailSheetProps {
  employeeId: string | null;
  onClose: () => void;
  onEdit: (employee: EmployeeResponse) => void;
}

export function EmployeeDetailSheet({
  employeeId,
  onClose,
  onEdit,
}: EmployeeDetailSheetProps) {
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.employees.detail(employeeId ?? ''),
    queryFn: () => api.get<EmployeeDetail>(`/employees/${employeeId}`),
    enabled: employeeId !== null,
  });

  const invalidateDetail = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.employees.detail(employeeId ?? ''),
    });

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<{ avatarUrl: string }>(
        `/employees/${employeeId}/avatar`,
        formData,
      );
    },
    onSuccess: () => {
      toast.success('Đã cập nhật avatar');
      void invalidateDetail();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Upload thất bại'),
  });

  const viewContractFile = useMutation({
    mutationFn: (contractId: string) =>
      api.get<{ url: string }>(
        `/employees/${employeeId}/contracts/${contractId}/file-url`,
      ),
    onSuccess: ({ url }) => window.open(url, '_blank'),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Không mở được file'),
  });

  return (
    <Sheet open={employeeId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {isLoading || !data ? (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Chi tiết nhân viên</SheetTitle>
              <SheetDescription>Đang tải hồ sơ…</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 p-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  {data.avatarUrl ? (
                    <AvatarImage src={data.avatarUrl} alt={data.fullName} />
                  ) : null}
                  <AvatarFallback>{initials(data.fullName)}</AvatarFallback>
                </Avatar>
                <div>
                  <SheetTitle>{data.fullName}</SheetTitle>
                  <SheetDescription>
                    {data.code} · {STATUS_LABELS[data.status]}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-8">
              <PermissionGate permission={PERMISSIONS.EMPLOYEE_UPDATE}>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onEdit(data)}>
                    Sửa hồ sơ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadAvatar.isPending}
                  >
                    <Upload className="size-3.5" /> Avatar
                  </Button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadAvatar.mutate(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </PermissionGate>

              <Separator />
              <div>
                <h3 className="mb-1 text-sm font-semibold">Thông tin</h3>
                <InfoRow label="Email tài khoản" value={data.userEmail} />
                <InfoRow label="Ngày sinh" value={data.dob} />
                <InfoRow
                  label="Giới tính"
                  value={
                    data.gender === 'MALE'
                      ? 'Nam'
                      : data.gender === 'FEMALE'
                        ? 'Nữ'
                        : data.gender
                          ? 'Khác'
                          : null
                  }
                />
                <InfoRow label="Điện thoại" value={data.phone} />
                <InfoRow label="Đơn vị" value={data.orgUnitName} />
                <InfoRow label="Chức danh" value={data.positionName} />
                <InfoRow label="Quản lý" value={data.managerName} />
                <InfoRow label="Địa điểm" value={data.worksiteName} />
                <InfoRow label="Ngày vào làm" value={data.joinDate} />
                <InfoRow label="Ngày nghỉ việc" value={data.leaveDate} />
              </div>

              <Separator />
              <ContractSection
                employeeId={data.id}
                contracts={data.contracts}
                onView={(id) => viewContractFile.mutate(id)}
                onChanged={invalidateDetail}
              />

              <Separator />
              <ShiftAssignmentSection employeeId={data.id} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

const CONTRACT_TYPES: { value: string; label: string }[] = [
  { value: 'PROBATION', label: 'Thử việc' },
  { value: 'FIXED_TERM', label: 'Xác định thời hạn' },
  { value: 'INDEFINITE', label: 'Không xác định thời hạn' },
];

/** Danh sách hợp đồng + thêm hợp đồng + upload/xoá file PDF (employee:update). */
function ContractSection({
  employeeId,
  contracts,
  onView,
  onChanged,
}: {
  employeeId: string;
  contracts: ContractResponse[];
  onView: (contractId: string) => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState('PROBATION');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const createContract = useMutation({
    mutationFn: () =>
      api.post<ContractResponse>(`/employees/${employeeId}/contracts`, {
        type,
        startDate,
        endDate: endDate || null,
        note: note || null,
      }),
    onSuccess: () => {
      toast.success('Đã thêm hợp đồng');
      setAdding(false);
      setEndDate('');
      setNote('');
      onChanged();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Thêm hợp đồng thất bại'),
  });

  const uploadFile = useMutation({
    mutationFn: ({ contractId, file }: { contractId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<ContractResponse>(
        `/employees/${employeeId}/contracts/${contractId}/file`,
        form,
        { method: 'PUT' },
      );
    },
    onSuccess: () => {
      toast.success('Đã tải lên file hợp đồng');
      onChanged();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Tải file thất bại'),
  });

  const deleteContract = useMutation({
    mutationFn: (contractId: string) =>
      api.delete<{ message: string }>(
        `/employees/${employeeId}/contracts/${contractId}`,
      ),
    onSuccess: () => {
      toast.success('Đã xoá hợp đồng');
      onChanged();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Hợp đồng ({contracts.length})</h3>
        <PermissionGate permission={PERMISSIONS.EMPLOYEE_UPDATE}>
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-3.5" /> Thêm
          </Button>
        </PermissionGate>
      </div>

      {adding && (
        <div className="mb-3 space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Loại hợp đồng</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Từ ngày</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Đến ngày (tuỳ chọn)</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ghi chú</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => createContract.mutate()}
            disabled={createContract.isPending}
          >
            {createContract.isPending ? 'Đang lưu…' : 'Lưu hợp đồng'}
          </Button>
        </div>
      )}

      {contracts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có hợp đồng</p>
      ) : (
        <div className="space-y-2">
          {contracts.map((contract) => (
            <div
              key={contract.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <div>
                <p className="font-medium">{CONTRACT_LABELS[contract.type]}</p>
                <p className="text-xs text-muted-foreground">
                  {contract.startDate} → {contract.endDate ?? 'hiện tại'}
                  {contract.note ? ` · ${contract.note}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {contract.hasFile ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onView(contract.id)}
                  >
                    <FileText className="size-3.5" /> Xem PDF
                  </Button>
                ) : (
                  <PermissionGate permission={PERMISSIONS.EMPLOYEE_UPDATE}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => fileInputRefs.current[contract.id]?.click()}
                      disabled={uploadFile.isPending}
                    >
                      <Upload className="size-3.5" /> Tải PDF
                    </Button>
                  </PermissionGate>
                )}
                <input
                  ref={(el) => {
                    fileInputRefs.current[contract.id] = el;
                  }}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile.mutate({ contractId: contract.id, file });
                    e.target.value = '';
                  }}
                />
                <PermissionGate permission={PERMISSIONS.EMPLOYEE_UPDATE}>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive"
                    onClick={() => deleteContract.mutate(contract.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </PermissionGate>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Lịch sử gán ca + gán ca mới (permission shift:manage). */
function ShiftAssignmentSection({ employeeId }: { employeeId: string }) {
  const queryClient = useQueryClient();
  const [shiftId, setShiftId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const { data: assignments } = useQuery({
    queryKey: queryKeys.org.shiftAssignments(employeeId),
    queryFn: () =>
      api.get<ShiftAssignmentResponse[]>(
        `/shifts/assignments?employeeId=${employeeId}`,
      ),
  });
  const { data: shifts } = useQuery({
    queryKey: queryKeys.org.shifts,
    queryFn: () => api.get<WorkShiftResponse[]>('/shifts'),
  });

  const assign = useMutation({
    mutationFn: () =>
      api.post<{ assigned: number }>('/shifts/assign', {
        shiftId,
        employeeId,
        effectiveFrom,
      }),
    onSuccess: () => {
      toast.success('Đã gán ca');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.org.shiftAssignments(employeeId),
      });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Gán ca thất bại'),
  });

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Clock className="size-3.5" /> Ca làm việc
      </h3>
      {(assignments ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa gán ca riêng — dùng ca mặc định theo đơn vị/tổ chức
        </p>
      ) : (
        <div className="space-y-1.5">
          {(assignments ?? []).map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <span className="font-medium">{a.shiftName}</span>
              <span className="text-xs text-muted-foreground">
                {a.effectiveFrom} → {a.effectiveTo ?? 'hiện tại'}
              </span>
            </div>
          ))}
        </div>
      )}
      <PermissionGate permission={PERMISSIONS.SHIFT_MANAGE}>
        <div className="mt-3 space-y-2 rounded-md border p-2">
          <Label className="text-xs">Gán ca mới</Label>
          <div className="flex gap-2">
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Chọn ca" />
              </SelectTrigger>
              <SelectContent>
                {(shifts ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              className="w-36"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => assign.mutate()}
            disabled={!shiftId || assign.isPending}
          >
            {assign.isPending ? 'Đang gán…' : 'Gán ca'}
          </Button>
        </div>
      </PermissionGate>
    </div>
  );
}
