import { describe, expect, it } from "vitest";
import { hashPassword, validatePassword, verifyPassword } from "./password";

describe("passwords", () => {
  it("hashes and verifies with Argon2id", async () => {
    const password = "correct horse battery staple";
    const encoded = await hashPassword(password);
    expect(encoded).toContain("argon2id");
    await expect(verifyPassword(encoded, password)).resolves.toBe(true);
    await expect(verifyPassword(encoded, "wrong password" )).resolves.toBe(false);
  });

  it("rejects short passwords", () => {
    expect(() => validatePassword("short")).toThrow();
  });
});
