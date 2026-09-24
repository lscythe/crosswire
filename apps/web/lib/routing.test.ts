import { expect, test } from "vitest";
import { routingSchema } from "./routing";

const route = {
  modelAlias: "chat",
  connectionId: "123e4567-e89b-12d3-a456-426614174000",
  upstreamModel: "model",
  priority: 0,
};
test("duplicate priorities for an alias are rejected", () => {
  expect(routingSchema.safeParse({ name: "config", routes: [route, route] }).success).toBe(false);
});
test("multiple aliases and ordered fallbacks are accepted", () => {
  expect(
    routingSchema.safeParse({
      name: "config",
      routes: [route, { ...route, priority: 1 }, { ...route, modelAlias: "other" }],
    }).success,
  ).toBe(true);
});
test("empty aliases and route lists are rejected", () => {
  expect(routingSchema.safeParse({ name: "config", routes: [] }).success).toBe(false);
  expect(
    routingSchema.safeParse({ name: "config", routes: [{ ...route, modelAlias: " " }] }).success,
  ).toBe(false);
});
