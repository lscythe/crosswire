import { describe, expect, it } from "vitest";
import { identityConfidence, overallStatus } from "./probe";

describe("model probe scoring", () => {
  it("requires independent identity evidence for high confidence", () => {
    expect(identityConfidence("model-a", "model-a", { model: "model-a" })).toBe("high");
    expect(identityConfidence("model-a", "model-a", {})).toBe("medium");
    expect(identityConfidence("model-a", "model-b", {})).toBe("low");
  });

  it("summarizes capability checks", () => {
    expect(overallStatus([{ capability: "chat", passed: true, evidence: {} }])).toBe("passed");
    expect(overallStatus([{ capability: "chat", passed: false, evidence: {} }])).toBe("failed");
  });
});
