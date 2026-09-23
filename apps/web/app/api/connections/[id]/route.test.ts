import { beforeEach, expect, test, vi } from "vitest";
vi.mock("../../../../lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("../../../../lib/db", () => ({ query: vi.fn() }));
vi.mock("../../../../lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("../../../../lib/secrets", () => ({ encryptSecret: vi.fn(() => "encrypted"), decryptSecret: () => "saved-secret" }));
import { currentUser } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { encryptSecret } from "../../../../lib/secrets";
import { PATCH, POST } from "./route";
const context = { params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }) };
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(currentUser).mockResolvedValue({ id: "owner", role: "member" } as never);
  vi.mocked(query).mockResolvedValue({ rows: [{ owner_user_id: "owner", base_url: "https://provider.example/v1", api_key_ciphertext: "encrypted", enabled: true }] } as never);
});
test("metadata can be edited without replacing the saved secret", async () => {
  const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ name: "Renamed", visibility: "public" }) }), context);
  expect(response.status).toBe(200);
  expect(encryptSecret).not.toHaveBeenCalled();
});
test("invalid fields cannot hide behind an enabled toggle", async () => {
  const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ enabled: false, visibility: "invalid" }) }), context);
  expect(response.status).toBe(400);
});
test("other members cannot edit a connection", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "other", role: "member" } as never);
  const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: '{"enabled":false}' }), context);
  expect(response.status).toBe(404);
});
test("connection test returns model IDs without upstream metadata", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ id: "model-a", secret: "saved-secret" }, { invalid: true }] })));
  const response = await POST(new Request("http://localhost", { method: "POST" }), context);
  expect(await response.json()).toEqual({ ok: true, status: 200, models: ["model-a"] });
});

test("another member cannot test a shared connection", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "other", role: "member" } as never);
  expect((await POST(new Request("http://localhost", { method: "POST" }), context)).status).toBe(404);
});

test("admin can manage another owner's connection", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "admin", role: "admin" } as never);
  expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: '{"enabled":false}' }), context)).status).toBe(200);
});

test.each([{}, { apiKey: "" }, { enabled: "false" }, { baseUrl: "http://localhost/v1" }])("rejects invalid edits: %j", async (body) => {
  expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), context)).status).toBe(400);
});

import { POST as probe } from "./probe/route";
test.each([null, { model: 123 }, { model: " " }, { model: "x".repeat(201) }])("probe validates model input: %j", async (body) => {
  expect((await probe(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), context)).status).toBe(400);
});

test.each([{ requestsPerMinute: 0 }, { requestsPerDay: -1 }, { requestsPerMinute: 1.5 }, { requestsPerDay: 1000001 }])("rejects invalid quota settings: %j", async body => {
  expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), context)).status).toBe(400);
});
test("unrelated connection edits preserve saved quota limits", async () => {
  await PATCH(new Request("http://localhost", { method: "PATCH", body: '{"enabled":false}' }), context);
  expect(vi.mocked(query).mock.calls[1][1]?.slice(5, 7)).toEqual([null, null]);
});
test("limited probes return retry information without contacting the provider", async () => {
  vi.mocked(query).mockResolvedValueOnce({ rows: [{ owner_user_id: "owner", visibility: "public" }] } as never)
    .mockResolvedValueOnce({ rows: [{ retry_after: 45 }] } as never);
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const response = await probe(new Request("http://localhost", { method: "POST", body: '{"model":"test"}' }), context);
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("45");
  expect(fetchMock).not.toHaveBeenCalled();
});
test("probes fail closed when quota storage is unavailable", async () => {
  vi.mocked(query).mockResolvedValueOnce({ rows: [{ owner_user_id: "owner", visibility: "public" }] } as never)
    .mockRejectedValueOnce(new Error("database unavailable"));
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  expect((await probe(new Request("http://localhost", { method: "POST", body: '{"model":"test"}' }), context)).status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});
