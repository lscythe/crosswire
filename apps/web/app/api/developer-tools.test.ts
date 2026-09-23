import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("../../lib/db", () => ({ query: vi.fn() }));
vi.mock("../../lib/secrets", () => ({ decryptSecret: vi.fn(() => "provider-secret") }));
import { currentUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { POST } from "./gateway-test/route";
import { GET } from "./provider-health/route";
const fetchMock = vi.fn();
const key = "cw_live_test-key-for-this-account";
const request = (value = key) => new Request("http://localhost/api/gateway-test", { method: "POST", body: JSON.stringify({ key: value }) });
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", fetchMock); vi.mocked(currentUser).mockResolvedValue({ id: "member" } as never); });
it("requires login for both checks", async () => {
  vi.mocked(currentUser).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect((await GET()).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects malformed, oversized, foreign and revoked keys before forwarding", async () => {
  vi.mocked(query).mockResolvedValue({ rows: [] } as never);
  expect((await POST(request("bad"))).status).toBe(400);
  expect((await POST(request(key.repeat(30)))).status).toBe(400);
  expect((await POST(request())).status).toBe(400);
  expect(vi.mocked(query).mock.calls[0][0]).toContain("revoked_at IS NULL");
  expect(vi.mocked(query).mock.calls[0][1]?.[0]).toBe("member");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("returns model count without returning keys or upstream bodies", async () => {
  vi.mocked(query).mockResolvedValue({ rows: [{ id: "key" }] } as never);
  fetchMock.mockResolvedValue(Response.json({ data: [{ id: "alias" }], secret: key }));
  const body = await (await POST(request())).json();
  expect(body).toMatchObject({ ok: true, status: 200, modelCount: 1 });
  expect(JSON.stringify(body)).not.toContain(key);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
});
it("reports network failures with elapsed time and no error details", async () => {
  vi.mocked(query).mockResolvedValue({ rows: [{ id: "key" }] } as never);
  fetchMock.mockRejectedValue(new Error(key));
  const body = await (await POST(request())).json();
  expect(body.ok).toBe(false);
  expect(body.latencyMs).toBeLessThan(10000);
  expect(JSON.stringify(body)).not.toContain(key);
});
it("checks only accessible default providers and redacts health failures", async () => {
  vi.mocked(query).mockResolvedValue({ rows: [1, 2, 3].map(id => ({ id: String(id), name: `Provider ${id}`, base_url: "https://provider.invalid/v1", api_key_ciphertext: "ciphertext" })) } as never);
  fetchMock.mockResolvedValueOnce(new Response("provider-secret", { status: 200 })).mockResolvedValueOnce(new Response("provider-secret", { status: 503 })).mockRejectedValueOnce(new Error("provider-secret"));
  const response = await GET();
  const body = await response.json();
  expect(body.providers.map((p: { status: string }) => p.status)).toEqual(["healthy", "degraded", "unreachable"]);
  expect(JSON.stringify(body)).not.toMatch(/provider-secret|ciphertext|provider.invalid/);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const sql = vi.mocked(query).mock.calls[0][0];
  for (const clause of ["cfg.owner_user_id = $1", "cfg.is_default", "c.enabled", "c.owner_user_id = $1 OR c.visibility = 'public'"]) expect(sql).toContain(clause);
});
