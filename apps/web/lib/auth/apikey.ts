import { createHash, randomBytes, randomUUID } from "node:crypto";

const PREFIX = "cw_live_";

export type ApiKeyRecord = {
  id: string;
  userId: string;
  name: string;
  keyHash: Buffer;
  keyPrefix: string;
};

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest();
}

export function createApiKey(userId: string, name: string) {
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${PREFIX}${secret}`;
  return {
    plaintext,
    record: {
      id: randomUUID(),
      userId,
      name,
      keyHash: hashApiKey(plaintext),
      keyPrefix: plaintext.slice(0, PREFIX.length + 8),
    } satisfies ApiKeyRecord,
  };
}
