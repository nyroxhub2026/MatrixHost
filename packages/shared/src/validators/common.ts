import { z } from "zod";

export const idSchema = z.string().uuid();

export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254);

export const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters")
  .max(128, "Password must not exceed 128 characters");

export const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(100);

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(63)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Invalid slug format"
  );

export const booleanSchema = z.boolean();

export const optionalDescriptionSchema = z
  .string()
  .trim()
  .max(1000)
  .optional();

export const isoDateSchema = z.iso.datetime();

export const paginationNumberSchema = z
  .number()
  .int()
  .positive();

export type IdInput = z.infer<typeof idSchema>;
export type EmailInput = z.infer<typeof emailSchema>;
export type NameInput = z.infer<typeof nameSchema>;
export type SlugInput = z.infer<typeof slugSchema>;
