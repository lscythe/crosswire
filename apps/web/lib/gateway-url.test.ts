import { expect, test } from "vitest";
import { gatewayUrl } from "./gateway-url";

test("uses the public domain in Dokploy and the gateway port in local Compose", () => {
  expect(gatewayUrl("https://crosswire.example.com/")).toBe("https://crosswire.example.com/v1");
  expect(gatewayUrl("http://localhost:3000")).toBe("http://localhost:8080/v1");
});
