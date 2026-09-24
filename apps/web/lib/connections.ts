import { z } from "zod";

export const connectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  baseUrl: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "base URL must use HTTP or HTTPS")
    .transform((value) => value.replace(/\/$/, "")),
  apiKey: z.string().min(1).max(4096),
  requestsPerMinute: z.number().int().min(1).max(10000).default(60),
  requestsPerDay: z.number().int().min(1).max(1000000).default(1000),
  visibility: z.enum(["private", "public"]).default("private"),
});

export const connectionUpdateSchema = connectionSchema
  .partial()
  .extend({ enabled: z.boolean().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export function isSafeProviderUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return (
    !["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"].includes(host) &&
    !host.endsWith(".internal") &&
    !host.endsWith(".local")
  );
}
