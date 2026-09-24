import { createHash, randomBytes, randomUUID } from "node:crypto";

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: Buffer;
  expiresAt: Date;
};

export type SessionRepository = {
  insert(record: SessionRecord): Promise<void>;
  findByHash(hash: Buffer): Promise<SessionRecord | null>;
  deleteById(id: string): Promise<void>;
};

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest();
}

export async function createSession(
  repository: SessionRepository,
  userId: string,
  ttlMs = 1000 * 60 * 60 * 24 * 7,
) {
  const token = randomBytes(32).toString("base64url");
  await repository.insert({
    id: randomUUID(),
    userId,
    tokenHash: hashOpaqueToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

export async function lookupSession(repository: SessionRepository, token: string) {
  const record = await repository.findByHash(hashOpaqueToken(token));
  if (!record || record.expiresAt <= new Date()) return null;
  return record;
}

export async function revokeSession(repository: SessionRepository, token: string) {
  const record = await repository.findByHash(hashOpaqueToken(token));
  if (record) await repository.deleteById(record.id);
}
