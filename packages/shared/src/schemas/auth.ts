import { z } from 'zod';
import { userResponseSchema } from './user';

export const emailSchema = z
  .email('Email không hợp lệ')
  .max(255)
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(128, 'Mật khẩu tối đa 128 ký tự')
  .regex(/[A-Za-z]/, 'Mật khẩu phải chứa ít nhất 1 chữ cái')
  .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất 1 chữ số');

/** OTP 6 chữ số (email verify / reset password / TOTP). */
export const otpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'Mã OTP gồm đúng 6 chữ số');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, 'Tên không được để trống').max(100),
});

/** Định danh đăng nhập: email HOẶC mã nhân viên (username). Lowercase để khớp. */
export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Nhập email hoặc mã nhân viên')
  .max(255)
  .transform((v) => v.toLowerCase());

export const loginSchema = z.object({
  identifier: loginIdentifierSchema,
  password: z.string().min(1, 'Mật khẩu không được để trống'),
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});

export const resendOtpSchema = z.object({
  email: emailSchema,
});

/** Body của /auth/refresh — token đọc từ cookie, field này cho mobile/non-browser. */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  newPassword: passwordSchema,
});

/**
 * Quên mật khẩu cho user KHÔNG có email: xác minh bằng mã nhân viên + số điện
 * thoại (phải khớp hồ sơ) → đặt lại mật khẩu. "1 cài đặt = 1 công ty" nên mã NV
 * là duy nhất.
 */
export const resetPasswordByIdentitySchema = z.object({
  employeeCode: z.string().trim().min(1, 'Nhập mã nhân viên').max(50),
  phone: z.string().trim().min(1, 'Nhập số điện thoại').max(30),
  newPassword: passwordSchema,
});

/** Bật 2FA: xác nhận bằng mã TOTP đầu tiên sau khi quét QR. */
export const enable2faSchema = z.object({
  code: otpCodeSchema,
});

/** Bước 2 của login khi user đã bật 2FA. */
export const verify2faSchema = z.object({
  pendingToken: z.string().min(1),
  code: otpCodeSchema,
  /** Tin cậy thiết bị này 30 ngày — lần sau đăng nhập không cần TOTP. */
  rememberDevice: z.boolean().optional(),
});

/** Đăng nhập bằng recovery code khi mất thiết bị TOTP. */
export const recovery2faSchema = z.object({
  pendingToken: z.string().min(1),
  recoveryCode: z.string().trim().min(8).max(32),
  rememberDevice: z.boolean().optional(),
});

/** Admin mời user qua email — user đặt mật khẩu khi nhận lời mời. */
export const inviteUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, 'Tên không được để trống').max(100),
  /** Roles gán sẵn; bỏ trống → role USER mặc định. */
  roleIds: z.array(z.uuid()).optional(),
});

export const acceptInviteSchema = z.object({
  email: emailSchema,
  token: z.string().min(32, 'Token lời mời không hợp lệ'),
  password: passwordSchema,
});

export const disable2faSchema = z.object({
  password: z.string().min(1, 'Nhập mật khẩu để tắt 2FA'),
});

// ---------- Response schemas ----------

export const loginResponseSchema = z.union([
  z.object({
    requires2fa: z.literal(true),
    pending2faToken: z.string(),
  }),
  z.object({
    requires2fa: z.literal(false),
    user: userResponseSchema,
  }),
]);

export const setup2faResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  /** Data-URL PNG để render thẳng vào <img>. */
  qrCodeDataUrl: z.string(),
});

export const enable2faResponseSchema = z.object({
  recoveryCodes: z.array(z.string()).length(8),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResetPasswordByIdentityInput = z.infer<typeof resetPasswordByIdentitySchema>;
export type Enable2faInput = z.infer<typeof enable2faSchema>;
export type Verify2faInput = z.infer<typeof verify2faSchema>;
export type Recovery2faInput = z.infer<typeof recovery2faSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type Disable2faInput = z.infer<typeof disable2faSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type Setup2faResponse = z.infer<typeof setup2faResponseSchema>;
export type Enable2faResponse = z.infer<typeof enable2faResponseSchema>;
