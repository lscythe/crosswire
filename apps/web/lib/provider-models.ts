import { z } from "zod";

export const capabilities = ["chat", "streaming", "json", "tools", "vision"] as const;
const support = z.boolean().nullable().optional();
export const modelSettingsSchema = z
  .object({
    contextWindow: z.number().int().min(1).max(100000000).nullable().optional(),
    maxOutputTokens: z.number().int().min(1).max(100000000).nullable().optional(),
    thinking: support,
    reasoningEfforts: z
      .array(z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]))
      .max(6)
      .optional(),
    capabilities: z
      .object({ chat: support, streaming: support, json: support, tools: support, vision: support })
      .strict()
      .optional(),
  })
  .strict();
export type ModelSettings = z.infer<typeof modelSettingsSchema>;
export type ImportedModel = ModelSettings & { id: string };
export type ProviderModel = {
  id: string;
  upstream_id: string;
  display_name: string;
  enabled: boolean;
  imported_metadata: ModelSettings;
  overrides: ModelSettings;
  discovered_by_key_id: string | null;
  imported_at: string | null;
};
export const modelSchema = z
  .object({
    upstreamId: z.string().trim().min(1).max(200),
    displayName: z.string().trim().min(1).max(200),
    enabled: z.boolean().default(true),
    overrides: modelSettingsSchema.default({}),
  })
  .strict();

export function importModels(payload: unknown): ImportedModel[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("data" in payload) ||
    !Array.isArray(payload.data)
  )
    throw new Error("Invalid model list");
  const models = new Map<string, ImportedModel>();
  for (const entry of payload.data.slice(0, 5000)) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.id !== "string" ||
      !entry.id.trim() ||
      entry.id.length > 200 ||
      models.has(entry.id)
    )
      continue;
    const model: ImportedModel = { id: entry.id };
    // ponytail: generic OpenAI metadata only; add explicit adapters for provider-specific formats.
    for (const [source, target] of [
      ["context_length", "contextWindow"],
      ["max_output_tokens", "maxOutputTokens"],
    ] as const) {
      const value = entry[source];
      if (Number.isInteger(value) && value > 0 && value <= 100000000) model[target] = value;
    }
    if (typeof entry.thinking === "boolean") model.thinking = entry.thinking;
    if (entry.capabilities && typeof entry.capabilities === "object") {
      for (const capability of capabilities)
        if (typeof entry.capabilities[capability] === "boolean") {
          model.capabilities ??= {};
          model.capabilities[capability] = entry.capabilities[capability];
        }
    }
    models.set(entry.id, model);
  }
  return [...models.values()];
}
