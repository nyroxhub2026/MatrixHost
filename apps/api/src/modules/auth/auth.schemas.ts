import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .max(254, "Email address is too long.")
  .toLowerCase()
  .pipe(
    z.email({
      message: "Please provide a valid email address.",
    })
  );

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must contain at least 3 characters.")
  .max(32, "Username cannot exceed 32 characters.")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username may contain only letters, numbers, underscores and hyphens."
  );

const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters.")
  .max(128, "Password cannot exceed 128 characters.")
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
    password: z
      .string()
      .min(1, "Password is required.")
      .max(128, "Password is too long."),
  })
  .strict();

export type RegisterInput = z.infer<
  typeof registerSchema
>;

export type LoginInput = z.infer<
  typeof loginSchema
>;
