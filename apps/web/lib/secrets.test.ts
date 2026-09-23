import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secrets";

describe("encrypted secrets", () => {
  it("round-trips with a deployment key", () => {
    process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const encrypted = encryptSecret("provider-secret");
    expect(encrypted).not.toContain("provider-secret");
    expect(decryptSecret(encrypted)).toBe("provider-secret");
  });
});
