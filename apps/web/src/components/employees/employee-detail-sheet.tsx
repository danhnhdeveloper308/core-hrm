'use client';

import {
  PERMISSIONS,
  type ContractResponse,
  type EmployeeDetailResponse,
  type EmployeeResponse,
  type MaritalStatus,
  type ShiftAssignmentResponse,
  type WorkShiftResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, FileText, Plus, ScanFace, Trash2, Upload } from 'lucide-react';
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

type EmployeeDetail = EmployeeDetailResponse;

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Chính thức',
  PROBATION: 'Thử việc',
  INACTIVE: 'Tạm nghỉ',
  TERMINATED: 'Đã nghỉ việc',
};

const MARITAL_LABELS: Record<MaritalStatus, string> = {
  SINGLE: 'Độc thân',
  MARRIED: 'Đã kết hôn',
  DIVORCED: 'Ly hôn',
  WIDOWED: 'Goá',
  OTHER: 'Khác',
};

/** Section hồ sơ chỉ hiện nếu có ít nhất 1 giá trị. */
function InfoSection({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string | null }[];
}) {
  if (rows.every((r) => !r.value)) return null;
  return (
    <>
      <Separator />
      <div>
        <h3 className="mb-1 text-sm font-semibold">{title}</h3>
        {rows.map((r) => (
          <InfoRow key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </>
  );
}

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
                <InfoRow label="Email cá nhân" value={data.personalEmail} />
                <InfoRow
                  label="Tình trạng hôn nhân"
                  value={data.maritalStatus ? MARITAL_LABELS[data.maritalStatus] : null}
                />
              </div>

              <InfoSection
                title="Giấy tờ & bảo hiểm"
                rows={[
                  { label: 'Số CCCD/CMND', value: data.idNumber },
                  { label: 'Ngày cấp', value: data.idIssuedDate },
                  { label: 'Nơi cấp', value: data.idIssuedPlace },
                  { label: 'Mã số thuế', value: data.taxCode },
                  { label: 'Số sổ BHXH', value: data.socialInsuranceNo },
                  { label: 'Số thẻ BHYT', value: data.healthInsuranceNo },
                ]}
              />
              <InfoSection
                title="Tài khoản ngân hàng"
                rows={[
                  { label: 'Số tài khoản', value: data.bankAccountNo },
                  { label: 'Ngân hàng', value: data.bankName },
                  { label: 'Chi nhánh', value: data.bankBranch },
                ]}
              />
              <InfoSection
                title="Địa chỉ"
                rows={[
                  { label: 'Thường trú', value: data.permanentAddress },
                  { label: 'Tạm trú / hiện tại', value: data.currentAddress },
                ]}
              />
              <InfoSection
                title="Liên hệ khẩn cấp"
                rows={[
                  { label: 'Họ tên', value: data.emergencyContactName },
                  { label: 'Điện thoại', value: data.emergencyContactPhone },
                  { label: 'Quan hệ', value: data.emergencyContactRelation },
                ]}
              />
              <InfoSection
                title="Thông tin khác"
                rows={[
                  { label: 'Quốc tịch', value: data.nationality },
                  { label: 'Dân tộc', value: data.ethnicity },
                  { label: 'Tôn giáo', value: data.religion },
                  { label: 'Trình độ', value: data.educationLevel },
                  { label: 'Chuyên ngành', value: data.major },
                ]}
              />

              {data.dependents.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-1 text-sm font-semibold">
                      Người phụ thuộc ({data.dependents.length})
                    </h3>
                    <div className="space-y-1.5">
                      {data.dependents.map((d) => (
                        <div
                          key={d.id}
                          className="rounded-md border p-2 text-sm"
                        >
                          <p className="font-medium">
                            {d.fullName} · {d.relationship}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {d.dob ? `Sinh ${d.dob}` : ''}
                            {d.taxCode ? ` · MST ${d.taxCode}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />
              <ContractSection
                employeeId={data.id}
                contracts={data.contracts}
                onView={(id) => viewContractFile.mutate(id)}
                onChanged={invalidateDetail}
              />

              <Separator />
              <ShiftAssignmentSection employeeId={data.id} />

              <PermissionGate permission={PERMISSIONS.FACE_MANAGE}>
                <Separator />
                <FaceSection employeeId={data.id} />
              </PermissionGate>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface EnrolledPhoto {
  index: number;
  url: string;
}

const MAX_FACE_PHOTOS = 5;

/** HR xem / xoá / thêm ảnh khuôn mặt chấm công của nhân viên (tối đa 5, ghi đè cũ). */
function FaceSection({ employeeId }: { employeeId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: photos } = useQuery({
    queryKey: ['face', 'employee', employeeId, 'photos'],
    queryFn: () => api.get<EnrolledPhoto[]>(`/face/${employeeId}/photos`),
  });
  const count = photos?.length ?? 0;
  const remaining = Math.max(0, MAX_FACE_PHOTOS - count);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['face', 'employee', employeeId, 'photos'],
    });

  const addPhotos = useMutation({
    mutationFn: (files: FileList) => {
      const form = new FormData();
      Array.from(files)
        .slice(0, MAX_FACE_PHOTOS)
        .forEach((f, i) => form.append('photos', f, f.name || `face-${i}.jpg`));
      return api.upload<{ enrolledCount: number }>(`/face/${employeeId}/photos`, form);
    },
    onSuccess: (res) => {
      toast.success(`Đã lưu — hiện có ${res.enrolledCount}/${MAX_FACE_PHOTOS} ảnh`);
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Lưu ảnh thất bại'),
  });

  const deletePhoto = useMutation({
    mutationFn: (index: number) =>
      api.delete<{ enrolledCount: number }>(`/face/${employeeId}/photos/${index}`),
    onSuccess: () => {
      toast.success('Đã xoá ảnh');
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ScanFace className="size-3.5" /> Khuôn mặt chấm công ({count}/{MAX_FACE_PHOTOS})
        </h3>
        <Button
          size="sm"
          variant="outline"
          disabled={addPhotos.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-3.5" /> Thêm ảnh
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) addPhotos.mutate(files);
            e.target.value = '';
          }}
        />
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {count === 0
          ? 'Chưa đăng ký — chọn ảnh rõ mặt, nhìn thẳng (1 mặt/ảnh).'
          : remaining > 0
            ? `Có thể thêm ${remaining} ảnh nữa.`
            : 'Đã đủ 5 ảnh — thêm nữa sẽ ghi đè ảnh cũ nhất.'}
      </p>
      {count > 0 && (
        <div className="flex flex-wrap gap-2">
          {(photos ?? []).map((p) => (
            <div key={p.index} className="relative">
              {/* signed URL từ storage — không dùng next/image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={`Ảnh ${p.index + 1}`}
                className="size-20 rounded-md border object-cover"
              />
              <button
                type="button"
                aria-label="Xoá ảnh"
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-1 text-white disabled:opacity-50"
                disabled={deletePhoto.isPending}
                onClick={() => deletePhoto.mutate(p.index)}
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
