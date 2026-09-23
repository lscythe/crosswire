import { z } from "zod";

export const connectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  baseUrl: z.string().url().refine((value) => /^https?:\/\//i.test(value), "base URL must use HTTP or HTTPS").transform((value) => value.replace(/\/$/, "")),
  apiKey: z.string().min(1).max(4096),
  visibility: z.enum(["private", "public"]).default("private"),
});

export function isSafeProviderUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return ![
    "localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254",
  ].includes(host) && !host.endsWith(".internal") && !host.endsWith(".local");
}
