import { describe, expect, it } from "vitest";
import { createApiKey, hashApiKey } from "./apikey";

describe("API keys", () => {
  it("returns plaintext once and stores a matching hash", () => {
    const { plaintext, record } = createApiKey("user-1", "local");
    expect(plaintext).toMatch(/^cw_live_/);
    expect(record.keyHash.equals(hashApiKey(plaintext))).toBe(true);
    expect(record.keyPrefix).not.toBe(plaintext);
  });
});
