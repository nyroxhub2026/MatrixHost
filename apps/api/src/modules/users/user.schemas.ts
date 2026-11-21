import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username may contain only letters, numbers, underscores and hyphens."
  );

const newPasswordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.");

export const updateProfileSchema = z
  .object({
    username: usernameSchema.optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one profile field is required."
  );

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: newPasswordSchema,
  })
  .strict()
  .refine(
    (data) => data.currentPassword !== data.newPassword,
    {
      message: "New password must be different from current password.",
      path: ["newPassword"],
    }
  );

export type UpdateProfileInput = z.infer<
  typeof updateProfileSchema
>;

export type ChangePasswordInput = z.infer<
  typeof changePasswordSchema
>;
