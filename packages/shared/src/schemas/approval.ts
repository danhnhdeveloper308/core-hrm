import { z } from 'zod';

export const approvalTargetTypeSchema = z.enum([
  'LEAVE',
  'ATTENDANCE_CORRECTION',
  'OT',
  'SHIFT_BATCH',
  'MANPOWER_REQUEST',
  'OFFER',
  'PERFORMANCE_REVIEW',
  'TRAINING_ENROLLMENT',
  'PAYROLL_RUN',
]);
export type ApprovalTargetType = z.infer<typeof approvalTargetTypeSchema>;

export const approverTypeSchema = z.enum([
  'DIRECT_MANAGER',
  'MANAGEMENT_CHAIN',
  'UNIT_MANAGER_OF_TYPE',
  'UNIT_MANAGER_OF_UNIT',
  'ROLE',
  'SPECIFIC_USER',
]);
export type ApproverType = z.infer<typeof approverTypeSchema>;

export const approvalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalDecisionSchema = z.enum(['APPROVE', 'REJECT']);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

// ===== Flow config =====

export const approvalFlowStepSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  approverType: approverTypeSchema,
  chainLevel: z.number().int().nullable(),
  unitTypeCode: z.string().nullable(),
  orgUnitId: z.uuid().nullable(),
  orgUnitName: z.string().nullable(),
  roleId: z.uuid().nullable(),
  roleName: z.string().nullable(),
  userId: z.uuid().nullable(),
  userName: z.string().nullable(),
  slaHours: z.number().int().nullable(),
  /** Nhãn hiển thị trên chữ ký (DUYỆT, GĐNM/TRƯỞNG ĐV…). */
  label: z.string().nullable(),
});
export type ApprovalFlowStepResponse = z.infer<typeof approvalFlowStepSchema>;

export const approvalFlowSchema = z.object({
  id: z.uuid(),
  targetType: approvalTargetTypeSchema,
  name: z.string(),
  priority: z.number().int(),
  conditions: z.record(z.string(), z.unknown()).nullable(),
  active: z.boolean(),
  steps: z.array(approvalFlowStepSchema),
});
export type ApprovalFlowResponse = z.infer<typeof approvalFlowSchema>;

export const createFlowStepSchema = z
  .object({
    approverType: approverTypeSchema,
    chainLevel: z.number().int().min(1).max(20).nullish(),
    unitTypeCode: z.string().trim().max(50).nullish(),
    orgUnitId: z.uuid().nullish(),
    roleId: z.uuid().nullish(),
    userId: z.uuid().nullish(),
    slaHours: z.number().int().min(1).max(720).nullish(),
    /** Nhãn hiển thị trên chữ ký phê duyệt. */
    label: z.string().trim().max(100).nullish(),
  })
  .refine(
    (v) =>
      v.approverType !== 'MANAGEMENT_CHAIN' || (v.chainLevel ?? 0) >= 1,
    { message: 'MANAGEMENT_CHAIN cần chainLevel ≥ 1', path: ['chainLevel'] },
  )
  .refine(
    (v) => v.approverType !== 'UNIT_MANAGER_OF_TYPE' || !!v.unitTypeCode,
    { message: 'UNIT_MANAGER_OF_TYPE cần unitTypeCode', path: ['unitTypeCode'] },
  )
  .refine(
    (v) => v.approverType !== 'UNIT_MANAGER_OF_UNIT' || !!v.orgUnitId,
    { message: 'UNIT_MANAGER_OF_UNIT cần chọn đơn vị', path: ['orgUnitId'] },
  )
  .refine((v) => v.approverType !== 'ROLE' || !!v.roleId, {
    message: 'ROLE cần roleId',
    path: ['roleId'],
  })
  .refine((v) => v.approverType !== 'SPECIFIC_USER' || !!v.userId, {
    message: 'SPECIFIC_USER cần userId',
    path: ['userId'],
  });
export type CreateFlowStepInput = z.infer<typeof createFlowStepSchema>;

export const createApprovalFlowSchema = z.object({
  targetType: approvalTargetTypeSchema,
  name: z.string().trim().min(1).max(200),
  priority: z.number().int().min(0).max(1000).default(0),
  conditions: z.record(z.string(), z.unknown()).nullish(),
  active: z.boolean().default(true),
  steps: z.array(createFlowStepSchema).min(1, 'Cần ít nhất 1 bước duyệt'),
});
export type CreateApprovalFlowInput = z.infer<typeof createApprovalFlowSchema>;

export const updateApprovalFlowSchema = createApprovalFlowSchema.partial().omit({
  targetType: true,
});
export type UpdateApprovalFlowInput = z.infer<typeof updateApprovalFlowSchema>;

// ===== Instance (đơn cần duyệt) =====

/** 1 bước trong snapshot: ai có thể duyệt + đã duyệt chưa. */
export const approvalStepStateSchema = z.object({
  order: z.number().int(),
  approverType: approverTypeSchema,
  label: z.string(),
  /** userId có quyền duyệt bước này (OR — bất kỳ ai). */
  approverIds: z.array(z.uuid()),
  approverNames: z.array(z.string()),
  skipped: z.boolean(),
  decidedByName: z.string().nullable(),
  decision: approvalDecisionSchema.nullable(),
  note: z.string().nullable(),
  decidedAt: z.string().nullable(),
  /** Thời hạn duyệt mong muốn (giờ) — null = không đặt. */
  slaHours: z.number().int().nullable(),
});
export type ApprovalStepState = z.infer<typeof approvalStepStateSchema>;

export const approvalInstanceSchema = z.object({
  id: z.uuid(),
  targetType: approvalTargetTypeSchema,
  targetId: z.uuid(),
  requesterName: z.string(),
  /** Mô tả ngắn nội dung đơn để hiển thị trong inbox (mọi loại). */
  summary: z.string().nullable(),
  currentStep: z.number().int(),
  status: approvalStatusSchema,
  steps: z.array(approvalStepStateSchema),
  createdAt: z.string(),
});
export type ApprovalInstanceResponse = z.infer<typeof approvalInstanceSchema>;

export const decideApprovalSchema = z.object({
  decision: approvalDecisionSchema,
  note: z.string().trim().max(500).nullish(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;
