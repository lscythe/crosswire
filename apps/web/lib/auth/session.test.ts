import { describe, expect, it } from "vitest";
import { createSession, lookupSession, revokeSession } from "./session";

function repository() {
  const records = new Map<string, any>();
  return {
    records,
    insert: async (record: any) => records.set(record.tokenHash.toString("hex"), record),
    findByHash: async (hash: Buffer) => records.get(hash.toString("hex")) ?? null,
    deleteById: async (id: string) => {
      for (const [key, record] of records) if (record.id === id) records.delete(key);
    },
  };
}

describe("sessions", () => {
  it("stores only a hash and supports lookup/revocation", async () => {
    const repo = repository();
    const token = await createSession(repo, "user-1");
    expect(token).not.toContain("user-1");
    expect(repo.records.size).toBe(1);
    await expect(lookupSession(repo, token)).resolves.toMatchObject({ userId: "user-1" });
    await revokeSession(repo, token);
    await expect(lookupSession(repo, token)).resolves.toBeNull();
  });
});
