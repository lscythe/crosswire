import { expect, test } from "vitest";
import { importModels, modelSettingsSchema } from "./provider-models";

test("imports bounded metadata, never arbitrary upstream fields", () => {
  expect(
    importModels({
      data: [
        { id: "model-a", context_length: 128000, secret: "hidden" },
        { id: "model-a" },
        { id: "" },
      ],
    }),
  ).toEqual([{ id: "model-a", contextWindow: 128000 }]);
  expect(importModels({ data: [{ id: "plain" }] })).toEqual([{ id: "plain" }]);
});
test("rejects invalid limits and unrecognized capability fields", () => {
  expect(modelSettingsSchema.safeParse({ contextWindow: -1 }).success).toBe(false);
  expect(modelSettingsSchema.safeParse({ contextWindow: 1.5 }).success).toBe(false);
  expect(modelSettingsSchema.safeParse({ capabilities: { invented: true } }).success).toBe(false);
  expect(
    modelSettingsSchema.safeParse({
      capabilities: { tools: null },
      thinking: true,
      reasoningEfforts: ["low", "high"],
    }).success,
  ).toBe(true);
});
