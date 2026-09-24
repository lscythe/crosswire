import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("../../lib/auth", () => ({ pageUser: vi.fn() }));
vi.mock("../../lib/db", () => ({ query: vi.fn() }));

import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";
import DashboardPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  vi.mocked(pageUser).mockResolvedValue({ id: "member", role: "member" } as never);
});
function results(requests = 0) {
  vi.mocked(query)
    .mockResolvedValueOnce({
      rows: [{ requests, succeeded: requests / 2, average_latency_ms: requests ? 150 : null }],
    } as never)
    .mockResolvedValueOnce({
      rows: requests
        ? [
            {
              id: "request",
              model: "team-model",
              status: 503,
              latency_ms: 150,
              error_reason: "upstream failed",
            },
          ]
        : [],
    } as never)
    .mockResolvedValueOnce({ rows: [] } as never)
    .mockResolvedValueOnce({ rows: [] } as never);
}
it("renders empty states without invented success or latency", async () => {
  results();
  const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("No requests in the last 24 hours");
  expect(html).toContain("No connections available");
  expect(html).toContain("No probe results available");
  expect(html).not.toContain("100%");
});
it("shares team metrics while protecting private connection and probe details", async () => {
  results(4);
  const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("50%");
  expect(html).toContain("HTTP 503");
  expect(html).toContain("150 ms");
  const calls = vi.mocked(query).mock.calls;
  expect(calls[0][1]).toEqual([]);
  expect(calls[0][0]).toContain("error_reason IS NULL");
  for (const call of calls.slice(2)) {
    expect(call[0]).toContain("c.visibility = 'public' OR c.owner_user_id = $1");
    expect(call[1]).toEqual(["member"]);
    expect(call[0]).not.toContain("api_key_ciphertext");
  }
});
it("filters personal request totals and recent requests by the signed-in user", async () => {
  results();
  await DashboardPage({ searchParams: Promise.resolve({ scope: "mine" }) });
  for (const call of vi.mocked(query).mock.calls.slice(0, 2)) {
    expect(call[0]).toContain("AND user_id = $1");
    expect(call[1]).toEqual(["member"]);
  }
});
it("requires authentication before querying dashboard data", async () => {
  vi.mocked(pageUser).mockRejectedValue(new Error("redirect to login"));
  await expect(DashboardPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    "redirect to login",
  );
  expect(query).not.toHaveBeenCalled();
});
