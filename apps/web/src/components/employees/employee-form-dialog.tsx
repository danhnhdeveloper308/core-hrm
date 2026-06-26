'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createEmployeeSchema,
  type CreateEmployeeInput,
  type CursorPaginated,
  type DependentResponse,
  type EmployeeResponse,
  type OrgUnitResponse,
  type PositionResponse,
  type WorksiteResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm, type Control, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api/client';
import { orgUnitOptions } from '@/lib/org';
import { queryKeys } from '@/lib/api/query-keys';

const NONE = '__none__';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Chính thức',
  PROBATION: 'Thử việc',
  INACTIVE: 'Tạm nghỉ',
  TERMINATED: 'Đã nghỉ việc',
};

type EmpFormInput = z.input<typeof createEmployeeSchema>;

/** Field text (string|null) gọn — dùng cho loạt trường hồ sơ. */
function TextField({
  control,
  name,
  label,
  type = 'text',
  placeholder,
}: {
  control: Control<EmpFormInput>;
  name: FieldPath<EmpFormInput>;
  label: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              value={(field.value as string | null | undefined) ?? ''}
              onChange={(e) => field.onChange(e.target.value || null)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface EmployeeFormDialogProps {
  open: boolean;
  /** null = tạo mới. */
  employee: EmployeeResponse | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EmployeeFormDialog({
  open,
  employee,
  onClose,
  onSaved,
}: EmployeeFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = employee !== null;

  const { data: units } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
    enabled: open,
  });
  // Nhãn breadcrumb theo cây để phân biệt phòng ban trùng tên giữa các nhánh
  const unitOptions = useMemo(() => orgUnitOptions(units ?? []), [units]);
  const { data: positions } = useQuery({
    queryKey: queryKeys.org.positions,
    queryFn: () => api.get<PositionResponse[]>('/positions'),
    enabled: open,
  });
  const { data: worksites } = useQuery({
    queryKey: queryKeys.org.worksites,
    queryFn: () => api.get<WorksiteResponse[]>('/worksites'),
    enabled: open,
  });
  // Danh sách nhân viên để chọn quản lý trực tiếp (loại chính mình khi sửa)
  const { data: managerOptions } = useQuery({
    queryKey: queryKeys.employees.list({ limit: 100, as: 'managers' }),
    queryFn: () =>
      api.get<CursorPaginated<EmployeeResponse>>('/employees?limit=100'),
    enabled: open,
  });

  const form = useForm<
    z.input<typeof createEmployeeSchema>,
    unknown,
    CreateEmployeeInput
  >({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      code: '',
      fullName: '',
      joinDate: new Date().toISOString().slice(0, 10),
      status: 'ACTIVE',
    },
    values: open
      ? {
          code: employee?.code ?? '',
          fullName: employee?.fullName ?? '',
          dob: employee?.dob ?? null,
          gender: employee?.gender ?? null,
          phone: employee?.phone ?? '',
          orgUnitId: employee?.orgUnitId ?? null,
          positionId: employee?.positionId ?? null,
          managerId: employee?.managerId ?? null,
          worksiteId: employee?.worksiteId ?? null,
          joinDate: employee?.joinDate ?? new Date().toISOString().slice(0, 10),
          status: employee?.status ?? 'ACTIVE',
          inviteEmail: null,
          personalEmail: employee?.personalEmail ?? null,
          idNumber: employee?.idNumber ?? null,
          idIssuedDate: employee?.idIssuedDate ?? null,
          idIssuedPlace: employee?.idIssuedPlace ?? null,
          taxCode: employee?.taxCode ?? null,
          socialInsuranceNo: employee?.socialInsuranceNo ?? null,
          healthInsuranceNo: employee?.healthInsuranceNo ?? null,
          bankAccountNo: employee?.bankAccountNo ?? null,
          bankName: employee?.bankName ?? null,
          bankBranch: employee?.bankBranch ?? null,
          permanentAddress: employee?.permanentAddress ?? null,
          currentAddress: employee?.currentAddress ?? null,
          emergencyContactName: employee?.emergencyContactName ?? null,
          emergencyContactPhone: employee?.emergencyContactPhone ?? null,
          emergencyContactRelation: employee?.emergencyContactRelation ?? null,
          maritalStatus: employee?.maritalStatus ?? null,
          ethnicity: employee?.ethnicity ?? null,
          nationality: employee?.nationality ?? null,
          religion: employee?.religion ?? null,
          educationLevel: employee?.educationLevel ?? null,
          major: employee?.major ?? null,
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateEmployeeInput) => {
      if (isEdit) {
        const rest = { ...values };
        delete rest.inviteEmail;
        return api.patch<EmployeeResponse>(`/employees/${employee.id}`, rest);
      }
      return api.post<EmployeeResponse>('/employees', values);
    },
    onSuccess: (saved) => {
      toast.success(
        isEdit ? `Đã cập nhật ${saved.fullName}` : `Đã tạo hồ sơ ${saved.fullName}`,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Lưu thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Sửa hồ sơ ${employee.fullName}` : 'Tạo hồ sơ nhân viên'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Cập nhật thông tin hồ sơ nhân viên'
              : 'Có thể mời tài khoản đăng nhập qua email ngay khi tạo'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Họ tên</FormLabel>
                    <FormControl>
                      <Input placeholder="Nguyễn Văn A" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mã nhân viên</FormLabel>
                    <FormControl>
                      <Input placeholder="NV-0001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="dob"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ngày sinh</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Giới tính</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>—</SelectItem>
                        <SelectItem value="MALE">Nam</SelectItem>
                        <SelectItem value="FEMALE">Nữ</SelectItem>
                        <SelectItem value="OTHER">Khác</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Điện thoại *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="09xxxxxxxx"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      Bắt buộc — dùng để khôi phục mật khẩu khi không có email.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="orgUnitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Đơn vị (phòng ban theo cơ cấu)</FormLabel>
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Chọn đơn vị" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {unitOptions.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="positionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chức danh</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>—</SelectItem>
                        {(positions ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="worksiteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Địa điểm</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>—</SelectItem>
                        {(worksites ?? []).map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="managerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quản lý trực tiếp</FormLabel>
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="— Không có —" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>— Không có —</SelectItem>
                      {(managerOptions?.items ?? [])
                        .filter((e) => e.id !== employee?.id)
                        .map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.fullName} ({e.code})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="joinDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ngày vào làm</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trạng thái</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {/* ===== Hồ sơ chi tiết (theo pháp luật VN) ===== */}
            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">
                Giấy tờ & bảo hiểm
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField control={form.control} name="idNumber" label="Số CCCD/CMND" />
                <TextField
                  control={form.control}
                  name="idIssuedDate"
                  label="Ngày cấp"
                  type="date"
                />
                <TextField
                  control={form.control}
                  name="idIssuedPlace"
                  label="Nơi cấp"
                />
                <TextField control={form.control} name="taxCode" label="Mã số thuế" />
                <TextField
                  control={form.control}
                  name="socialInsuranceNo"
                  label="Số sổ BHXH"
                />
                <TextField
                  control={form.control}
                  name="healthInsuranceNo"
                  label="Số thẻ BHYT"
                />
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">
                Tài khoản ngân hàng
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField
                  control={form.control}
                  name="bankAccountNo"
                  label="Số tài khoản"
                />
                <TextField control={form.control} name="bankName" label="Ngân hàng" />
                <TextField control={form.control} name="bankBranch" label="Chi nhánh" />
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">
                Địa chỉ
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  control={form.control}
                  name="permanentAddress"
                  label="Thường trú"
                />
                <TextField
                  control={form.control}
                  name="currentAddress"
                  label="Tạm trú / hiện tại"
                />
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">
                Liên hệ khẩn cấp
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField
                  control={form.control}
                  name="emergencyContactName"
                  label="Họ tên"
                />
                <TextField
                  control={form.control}
                  name="emergencyContactPhone"
                  label="Điện thoại"
                />
                <TextField
                  control={form.control}
                  name="emergencyContactRelation"
                  label="Quan hệ"
                />
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">
                Thông tin khác
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField
                  control={form.control}
                  name="maritalStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hôn nhân</FormLabel>
                      <Select
                        value={field.value ?? NONE}
                        onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>—</SelectItem>
                          <SelectItem value="SINGLE">Độc thân</SelectItem>
                          <SelectItem value="MARRIED">Đã kết hôn</SelectItem>
                          <SelectItem value="DIVORCED">Ly hôn</SelectItem>
                          <SelectItem value="WIDOWED">Goá</SelectItem>
                          <SelectItem value="OTHER">Khác</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <TextField
                  control={form.control}
                  name="nationality"
                  label="Quốc tịch"
                  placeholder="Việt Nam"
                />
                <TextField control={form.control} name="ethnicity" label="Dân tộc" />
                <TextField control={form.control} name="religion" label="Tôn giáo" />
                <TextField
                  control={form.control}
                  name="educationLevel"
                  label="Trình độ"
                />
                <TextField control={form.control} name="major" label="Chuyên ngành" />
                <TextField
                  control={form.control}
                  name="personalEmail"
                  label="Email cá nhân"
                  type="email"
                />
              </div>
            </div>

            {isEdit && <DependentsSection employeeId={employee.id} />}

            {!isEdit && (
              <FormField
                control={form.control}
                name="inviteEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email mời tài khoản (tuỳ chọn)</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="nhanvien@congty.vn"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormDescription>
                      Có email → gửi link kích hoạt. Bỏ trống → tự tạo tài khoản đăng
                      nhập bằng <b>mã nhân viên</b> + mật khẩu mặc định{' '}
                      <b>Abcd123@</b> (đổi sau lần đăng nhập đầu). Role EMPLOYEE.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_DEP = { fullName: '', relationship: '', dob: '', taxCode: '' };

/** Người phụ thuộc (giảm trừ gia cảnh) — chỉ hiện khi sửa (NV đã tồn tại). */
function DependentsSection({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(EMPTY_DEP);
  const { data: deps } = useQuery({
    queryKey: queryKeys.employees.dependents(employeeId),
    queryFn: () =>
      api.get<DependentResponse[]>(`/employees/${employeeId}/dependents`),
  });
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: queryKeys.employees.dependents(employeeId) });

  const add = useMutation({
    mutationFn: () =>
      api.post(`/employees/${employeeId}/dependents`, {
        fullName: draft.fullName,
        relationship: draft.relationship,
        dob: draft.dob || null,
        taxCode: draft.taxCode || null,
      }),
    onSuccess: () => {
      setDraft(EMPTY_DEP);
      invalidate();
      toast.success('Đã thêm người phụ thuộc');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Lỗi'),
  });
  const del = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/employees/${employeeId}/dependents/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="border-t pt-3">
      <p className="mb-2 text-sm font-semibold text-muted-foreground">
        Người phụ thuộc (giảm trừ gia cảnh)
      </p>
      <div className="space-y-1.5">
        {(deps ?? []).map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
          >
            <span className="flex-1">
              <b>{d.fullName}</b> · {d.relationship}
              {d.dob ? ` · ${d.dob}` : ''}
              {d.taxCode ? ` · MST ${d.taxCode}` : ''}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-destructive"
              onClick={() => del.mutate(d.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        {(deps ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">Chưa có người phụ thuộc</p>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input
          placeholder="Họ tên"
          value={draft.fullName}
          onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
        />
        <Input
          placeholder="Quan hệ (con/vợ…)"
          value={draft.relationship}
          onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}
        />
        <Input
          type="date"
          value={draft.dob}
          onChange={(e) => setDraft({ ...draft, dob: e.target.value })}
        />
        <div className="flex gap-1">
          <Input
            placeholder="MST"
            value={draft.taxCode}
            onChange={(e) => setDraft({ ...draft, taxCode: e.target.value })}
          />
          <Button
            type="button"
            size="sm"
            disabled={!draft.fullName || !draft.relationship || add.isPending}
            onClick={() => add.mutate()}
          >
            Thêm
          </Button>
        </div>
      </div>
    </div>
  );
}
