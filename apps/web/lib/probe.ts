export type ProbeCheck = { capability: string; passed: boolean; evidence: Record<string, unknown> };

export function identityConfidence(
  requested: string,
  returned: string | null,
  metadata: Record<string, unknown>,
) {
  if (returned === requested && metadata.model === requested) return "high" as const;
  if (returned === requested || metadata.model === requested) return "medium" as const;
  if (returned) return "low" as const;
  return "unknown" as const;
}

export function overallStatus(checks: ProbeCheck[]) {
  const passed = checks.filter((check) => check.passed).length;
  if (passed === checks.length) return "passed" as const;
  if (passed === 0) return "failed" as const;
  return "partial" as const;
}
