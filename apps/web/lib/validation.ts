import { z } from "zod";

export const usernameSchema = z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/);

export const credentialsSchema = z.object({
  username: usernameSchema,
  password: z.string().min(12).max(1024),
});

export const createUserSchema = z.object({
  username: usernameSchema,
  email: z.string().email().transform((value) => value.toLowerCase()),
  role: z.enum(["admin", "member"]).default("member"),
});

export const apiKeySchema = z.object({ name: z.string().trim().min(1).max(80) });
