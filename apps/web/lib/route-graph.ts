export type GraphStatus = "healthy" | "degraded" | "unreachable" | "disabled";

export type GraphProvider = {
  id: string;
  name: string;
  enabled: boolean;
  status: GraphStatus;
  latencyMs: number | null;
  lastRequestAt: string | null;
  logoKey: string | null;
};

export type GraphSnapshot = {
  providers: GraphProvider[];
  updatedAt: string;
  scope: "default" | "all";
};

const LOGO_KEYS: Record<string, string> = {
  anthropic: "anthropic",
  deepseek: "deepseek",
  google: "google",
  groq: "groq",
  openai: "openai",
  openrouter: "openrouter",
  dahono: "dahono",
};

export function providerLogo(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  const match = Object.keys(LOGO_KEYS).find((key) => normalized.includes(key));
  return match ? LOGO_KEYS[match] : null;
}

export function statusFromHealth(
  enabled: boolean,
  healthStatus: string | null | undefined,
): GraphStatus {
  if (!enabled) return "disabled";
  if (healthStatus === "healthy") return "healthy";
  if (healthStatus === "unreachable") return "unreachable";
  return "degraded";
}
