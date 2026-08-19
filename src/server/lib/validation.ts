import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(20, "Username must be at most 20 characters.")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Display name must be at least 2 characters.")
  .max(24, "Display name must be at most 24 characters.");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters.")
  .regex(/[A-Za-z]/, "Password needs at least one letter.")
  .regex(/[0-9]/, "Password needs at least one number.");

export const registerSchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    inviteCode: z.string().trim().max(24).optional().or(z.literal("")),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  login: z.string().trim().min(1, "Enter your username or email."),
  password: z.string().min(1, "Enter your password."),
});

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z.object({
  token: z.string().min(10, "Invalid reset token."),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((v) => v.password === v.confirmPassword, {
  message: "Passwords don't match.",
  path: ["confirmPassword"],
});

export const profilePatchSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatar: z.string().trim().min(1).max(8).optional(),
  bio: z.string().trim().max(160, "Bio must be at most 160 characters.").optional(),
});

export const finishGameSchema = z.object({
  sessionId: z.string().uuid("Invalid session."),
  score: z.number().int().min(0).max(100000),
});

export const adjustSchema = z.object({
  amount: z
    .number()
    .int("Amount must be a whole number.")
    .refine((v) => v !== 0, "Amount cannot be zero.")
    .refine((v) => Math.abs(v) <= 10_000_000, "Amount too large."),
  reason: z.string().trim().min(3, "A reason is required.").max(140),
});

export const statusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().min(3, "A reason is required.").max(140),
});

export const rewardPatchSchema = z.object({
  code: z.string().trim().min(1),
  arcAmount: z.number().int().min(0).max(1_000_000),
  xpAmount: z.number().int().min(0).max(100_000),
});

export const settingsPatchSchema = z.object({
  XP_BASE: z.number().int().min(50).max(100_000),
  XP_STEP: z.number().int().min(0).max(50_000),
});

export const announceSchema = z.object({
  title: z.string().trim().min(3, "Title is required.").max(80),
  body: z.string().trim().min(3, "Message is required.").max(500),
});

export const gameCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Slug can contain lowercase letters, numbers and dashes."),
  name: z.string().trim().min(2, "Name is required.").max(60),
  description: z.string().trim().max(500).default(""),
  icon: z.string().trim().min(1).max(8).default("🎮"),
  thumbnail: z.string().trim().max(300).optional().or(z.literal("")),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  entryCost: z.number().int().min(0).max(1_000_000),
  maxReward: z.number().int().min(0).max(1_000_000),
  engine: z.string().trim().min(1),
  config: z.unknown().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const gamePatchSchema = gameCreateSchema.partial().extend({
  slug: z.undefined().optional(), // slug is immutable
});
