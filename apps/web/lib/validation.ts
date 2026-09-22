import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12),
});

export const invitationSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  role: z.enum(["admin", "member"]).default("member"),
});

export const apiKeySchema = z.object({ name: z.string().trim().min(1).max(80) });
