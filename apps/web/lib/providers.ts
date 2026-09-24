import { z } from "zod";
import { query } from "./db";
import { importModels } from "./provider-models";
import { decryptSecret } from "./secrets";

export const uuid = z.string().uuid();
export type ProviderAccess = {
  id: string;
  owner_user_id: string;
  name: string;
  base_url: string;
  enabled: boolean;
  visibility: string;
  key_mode: "selected" | "round_robin";
  selected_key_id: string | null;
  requests_per_minute: number;
  requests_per_day: number;
  api_key_ciphertext?: string;
};
export async function providerAccess(
  id: string,
  user: { id: string; role: string },
  manage = false,
): Promise<ProviderAccess | null> {
  if (!uuid.safeParse(id).success) return null;
  const result = await query<ProviderAccess>(
    "SELECT id, owner_user_id, name, base_url, enabled, visibility, key_mode, selected_key_id, requests_per_minute, requests_per_day FROM connections WHERE id = $1 AND ($2 = 'admin' OR owner_user_id = $3 OR ($4 AND visibility = 'public'))",
    [id, user.role, user.id, !manage],
  );
  return result.rows[0] ?? null;
}
export async function providerKey(
  provider: ProviderAccess & { api_key_ciphertext?: string },
  keyId?: string,
) {
  const result = await query<{ id: string; ciphertext: string }>(
    "SELECT id, ciphertext FROM provider_keys WHERE provider_id = $1 AND id = $2 AND enabled",
    [provider.id, keyId ?? provider.selected_key_id],
  );
  return (
    result.rows[0] ??
    (provider.api_key_ciphertext
      ? { id: keyId ?? "legacy", ciphertext: provider.api_key_ciphertext }
      : null)
  );
}
export async function readBounded(response: Response, limit = 1024 * 1024) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > limit) throw new Error("Provider response too large");
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function discoverModels(baseUrl: string, apiKey: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Provider returned HTTP ${response.status}`);
  }
  return importModels(JSON.parse(await readBounded(response)));
}
export async function discoverWithKey(provider: ProviderAccess, keyId?: string) {
  const key = await providerKey(provider, keyId);
  if (!key) throw new Error("Select an enabled provider key");
  return {
    keyId: key.id,
    models: await discoverModels(provider.base_url, decryptSecret(key.ciphertext)),
  };
}
