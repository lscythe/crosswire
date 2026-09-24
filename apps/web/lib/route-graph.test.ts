import { describe, expect, test } from "vitest";
import { type GraphProvider, providerLogo, statusFromHealth } from "./route-graph";

describe("providerLogo", () => {
  test("matches known provider names case-insensitively", () => {
    expect(providerLogo("OpenRouter Gateway")).toBe("openrouter");
    expect(providerLogo("Dahono")).toBe("dahono");
  });

  test("returns null for unknown providers", () => {
    expect(providerLogo("Internal Team Proxy")).toBeNull();
  });
});

describe("statusFromHealth", () => {
  test.each([
    [false, "healthy", "disabled"],
    [true, "healthy", "healthy"],
    [true, "unreachable", "unreachable"],
    [true, "degraded", "degraded"],
    [true, null, "degraded"],
  ])("maps %j to %s", (enabled, health, expected) => {
    expect(statusFromHealth(enabled, health)).toBe(expected);
  });
});

test("graph provider shape contains no secret fields", () => {
  const provider: GraphProvider = {
    id: "provider-id",
    name: "Dahono",
    enabled: true,
    status: "healthy",
    latencyMs: 42,
    lastRequestAt: null,
    logoKey: "dahono",
  };
  expect(Object.keys(provider)).not.toEqual(
    expect.arrayContaining(["apiKey", "api_key_ciphertext", "ciphertext", "secret"]),
  );
});
