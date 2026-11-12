import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const totpCode = z.string().regex(/^\d{6}$/, 'Must be a 6-digit code');

/** At least 12 characters with letters and digits; length beats complexity rules. */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a digit');

export const loginRequestSchema = z.object({
  tenantSlug: z.string().trim().toLowerCase().min(1),
  email,
  password: z.string().min(1).max(128),
  totpCode: totpCode.optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const platformLoginRequestSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  totpCode: totpCode.optional(),
});
export type PlatformLoginRequest = z.infer<typeof platformLoginRequestSchema>;

export const refreshRequestSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const acceptInviteRequestSchema = z.object({
  inviteToken: z.string().min(1),
  password: passwordSchema,
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'New password must differ from the current one',
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const enableMfaRequestSchema = z.object({ code: totpCode });
export type EnableMfaRequest = z.infer<typeof enableMfaRequestSchema>;

/**
 * `full` grants normal access. `mfa_setup` is issued to users whose role requires 2FA
 * but who have not enrolled yet; it only unlocks the enrolment endpoints.
 */
export type SessionStage = 'full' | 'mfa_setup';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  stage: SessionStage;
}

export interface MfaSetupResponse {
  secret: string;
  otpauthUrl: string;
}
