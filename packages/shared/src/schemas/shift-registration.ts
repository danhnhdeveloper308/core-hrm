import { z } from 'zod';

export const shiftVariantSchema = z.enum(['XUONG_CA', 'GIAN_CA', 'TANG_CA']);
export type ShiftVariant = z.infer<typeof shiftVariantSchema>;

export const SHIFT_VARIANT_LABELS: Record<ShiftVariant, string> = {
  XUONG_CA: 'Xuống ca',
  GIAN_CA: 'Giãn ca',
  TANG_CA: 'Tăng ca',
};

export const shiftRegistrationLineSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  date: z.string(),
  variant: shiftVariantSchema,
  reason: z.string().nullable(),
});
export type ShiftRegistrationLineResponse = z.infer<typeof shiftRegistrationLineSchema>;

export const shiftRegistrationBatchSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
  uploadedByName: z.string().nullable(),
  approvalInstanceId: z.uuid().nullable(),
  lineCount: z.number().int(),
  createdAt: z.string(),
  lines: z.array(shiftRegistrationLineSchema).optional(),
});
export type ShiftRegistrationBatchResponse = z.infer<typeof shiftRegistrationBatchSchema>;

/** Kết quả upload: tạo phiếu + dòng lỗi (bỏ qua) để user sửa file. */
export const uploadBatchResultSchema = z.object({
  batchId: z.uuid(),
  created: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), message: z.string() })),
});
export type UploadBatchResult = z.infer<typeof uploadBatchResultSchema>;
