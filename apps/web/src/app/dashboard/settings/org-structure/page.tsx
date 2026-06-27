'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PERMISSIONS,
  createOrgUnitSchema,
  type CreateOrgUnitInput,
  type OrgUnitResponse,
  type OrgUnitTypeResponse,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  MoveRight,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FadeIn } from '@/components/motion/primitives';
import { OrgUnitCascader } from '@/components/org/org-unit-cascader';
import { PermissionGate } from '@/components/permission-gate';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { orgUnitBreadcrumb } from '@/lib/org';

interface TreeNode extends OrgUnitResponse {
  children: TreeNode[];
}

function buildTree(units: OrgUnitResponse[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(
    units.map((u) => [u.id, { ...u, children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export default function OrgStructurePage() {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Dialog state: tạo con của node nào (null = node gốc), sửa node, move node, xoá node
  const [createParent, setCreateParent] = useState<OrgUnitResponse | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrgUnitResponse | null>(null);
  const [moveTarget, setMoveTarget] = useState<OrgUnitResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgUnitResponse | null>(null);

  const { data: units, isLoading } = useQuery({
    queryKey: queryKeys.org.units,
    queryFn: () => api.get<OrgUnitResponse[]>('/org-units'),
  });
  const { data: types } = useQuery({
    queryKey: queryKeys.org.unitTypes,
    queryFn: () => api.get<OrgUnitTypeResponse[]>('/org-unit-types'),
  });

  const tree = useMemo(() => buildTree(units ?? []), [units]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.org.units });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/org-units/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Xoá thất bại'),
  });

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(node: TreeNode, depth: number) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          <button
            type="button"
            className="flex size-5 items-center justify-center text-muted-foreground"
            onClick={() => hasChildren && toggle(node.id)}
          >
            {hasChildren ? (
              isCollapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )
            ) : (
              <span className="size-4" />
            )}
          </button>
          <span className="font-medium">{node.name}</span>
          <Badge variant="outline" className="text-xs">
            {node.typeName}
          </Badge>
          <span className="text-xs text-muted-foreground">{node.code}</span>
          <PermissionGate permission={PERMISSIONS.ORGUNIT_MANAGE}>
            <div className="ml-auto hidden items-center gap-1 group-hover:flex">
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title="Thêm đơn vị con"
                onClick={() => {
                  setCreateParent(node);
                  setCreateOpen(true);
                }}
              >
                <Plus className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title="Sửa"
                onClick={() => setEditTarget(node)}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title="Chuyển sang nhánh khác"
                onClick={() => setMoveTarget(node)}
              >
                <MoveRight className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-destructive"
                title="Xoá"
                onClick={() => setDeleteTarget(node)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </PermissionGate>
        </div>
        {!isCollapsed && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <FadeIn className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cơ cấu tổ chức</h1>
          <p className="text-muted-foreground">
            Cây đơn vị N tầng — thêm, sửa, chuyển nhánh
          </p>
        </div>
        <PermissionGate permission={PERMISSIONS.ORGUNIT_MANAGE}>
          <Button
            onClick={() => {
              setCreateParent(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" /> Thêm node gốc
          </Button>
        </PermissionGate>
      </div>

      <div className="rounded-md border p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <FolderTree className="size-8" />
            <p>Chưa có đơn vị nào</p>
          </div>
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>

      <UnitFormDialog
        open={createOpen}
        parent={createParent}
        units={units ?? []}
        types={types ?? []}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void invalidate()}
      />
      <UnitEditDialog
        target={editTarget}
        types={types ?? []}
        onClose={() => setEditTarget(null)}
        onSaved={() => void invalidate()}
      />
      <UnitMoveDialog
        target={moveTarget}
        units={units ?? []}
        onClose={() => setMoveTarget(null)}
        onSaved={() => void invalidate()}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá đơn vị {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Chỉ xoá được đơn vị không còn đơn vị con.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FadeIn>
  );
}

// ===== Dialog tạo đơn vị =====

function UnitFormDialog({
  open,
  parent,
  units,
  types,
  onClose,
  onSaved,
}: {
  open: boolean;
  parent: OrgUnitResponse | null;
  units: OrgUnitResponse[];
  types: OrgUnitTypeResponse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Breadcrumb đầy đủ của đơn vị cha (rõ ngữ cảnh ở tập đoàn trùng tên phòng ban)
  const parentBreadcrumb = useMemo(() => {
    if (!parent) return null;
    const byId = new Map(units.map((u) => [u.id, u]));
    return orgUnitBreadcrumb(parent, byId);
  }, [parent, units]);

  const form = useForm<CreateOrgUnitInput>({
    resolver: zodResolver(createOrgUnitSchema),
    defaultValues: { name: '', code: '', typeId: '', parentId: null },
    values: open
      ? { name: '', code: '', typeId: types[0]?.id ?? '', parentId: parent?.id ?? null }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateOrgUnitInput) =>
      api.post<OrgUnitResponse>('/org-units', values),
    onSuccess: (unit) => {
      toast.success(`Đã tạo đơn vị ${unit.name}`);
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Tạo đơn vị thất bại'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {parent ? `Thêm đơn vị con của ${parent.name}` : 'Thêm node gốc'}
          </DialogTitle>
          <DialogDescription>
            {parentBreadcrumb ? `Trực thuộc: ${parentBreadcrumb}. ` : ''}
            Loại đơn vị tự do — cây không ép đúng thứ tự tầng.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên đơn vị</FormLabel>
                  <FormControl>
                    <Input placeholder="Nhà máy Bình Dương" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="NM-BD" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="typeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loại đơn vị</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Chọn loại" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {types.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Đang tạo…' : 'Tạo'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ===== Dialog sửa đơn vị =====

function UnitEditDialog({
  target,
  types,
  onClose,
  onSaved,
}: {
  target: OrgUnitResponse | null;
  types: OrgUnitTypeResponse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<CreateOrgUnitInput>({
    resolver: zodResolver(createOrgUnitSchema),
    values: target
      ? {
          name: target.name,
          code: target.code,
          typeId: target.typeId,
          parentId: target.parentId,
        }
      : undefined,
    defaultValues: { name: '', code: '', typeId: '', parentId: null },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateOrgUnitInput) =>
      api.patch<OrgUnitResponse>(`/org-units/${target?.id}`, {
        name: values.name,
        code: values.code,
        typeId: values.typeId,
      }),
    onSuccess: (unit) => {
      toast.success(`Đã cập nhật ${unit.name}`);
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Cập nhật thất bại'),
  });

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa đơn vị {target?.name}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên đơn vị</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="typeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loại đơn vị</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {types.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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

// ===== Dialog chuyển nhánh =====

function UnitMoveDialog({
  target,
  units,
  onClose,
  onSaved,
}: {
  target: OrgUnitResponse | null;
  units: OrgUnitResponse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // null = làm node gốc. Đơn vị đích đang chọn làm CHA mới.
  const [parentId, setParentId] = useState<string | null>(null);

  // Loại chính nó và toàn bộ subtree của nó (chống chu trình) trước khi đưa vào
  // cascader — đã loại cả nhánh con nên cây con không bị mồ côi.
  const candidates = useMemo(
    () => (target ? units.filter((u) => !u.path.startsWith(target.path)) : []),
    [target, units],
  );

  const selectedParent = parentId
    ? candidates.find((u) => u.id === parentId)
    : undefined;

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<OrgUnitResponse>(`/org-units/${target?.id}/move`, {
        parentId,
      }),
    onSuccess: (unit) => {
      toast.success(`Đã chuyển ${unit.name}`);
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Chuyển thất bại'),
  });

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          setParentId(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chuyển {target?.name} sang nhánh khác</DialogTitle>
          <DialogDescription>
            Toàn bộ đơn vị con đi theo. Không thể chuyển vào chính nhánh của nó.
          </DialogDescription>
        </DialogHeader>
        <OrgUnitCascader
          units={candidates}
          value={parentId}
          onChange={setParentId}
          placeholder="— Làm node gốc —"
        />
        <p className="text-sm text-muted-foreground">
          Cha mới: <b>{selectedParent ? selectedParent.name : '— Node gốc —'}</b>
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Đang chuyển…' : 'Chuyển'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
