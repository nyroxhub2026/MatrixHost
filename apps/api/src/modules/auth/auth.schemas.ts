import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username may contain only letters, numbers, underscores and hyphens."
  );

const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(
    /[a-z]/,
    "Password must contain a lowercase letter."
  )
  .regex(
    /[A-Z]/,
    "Password must contain an uppercase letter."
  )
  .regex(
    /[0-9]/,
    "Password must contain a number."
  );

export const registerSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export type RegisterInput = z.infer<
  typeof registerSchema
>;

export type LoginInput = z.infer<
  typeof loginSchema
>;
