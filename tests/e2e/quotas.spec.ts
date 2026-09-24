import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("public quotas are atomic across keys, isolated per user, visible to owners, and allow fallback", async ({
  request,
  browser,
}) => {
  test.skip(!process.env.TEST_PROVIDER_URL, "Requires local fixture provider");
  const base = "http://localhost:3000";
  const gateway = process.env.GATEWAY_URL ?? "http://localhost:8080";
  expect(
    (
      await request.post(`${base}/api/auth/login`, {
        data: {
          username: process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin",
          password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "replace-with-a-long-password",
        },
      })
    ).status(),
  ).toBe(200);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const names: string[] = [];
  const connectionIds: string[] = [];
  const configIds: string[] = [];
  const keys: Array<{ id: string; key: string; user: number }> = [];
  try {
    for (const [index, context] of contexts.entries()) {
      const email = `quota-${randomUUID()}@example.com`;
      names.push(email);
      const account = await (
        await request.post(`${base}/api/users`, { data: { username: email.split("@")[0], email } })
      ).json();
      await context.request.post(`${base}/api/auth/login`, {
        data: { username: email.split("@")[0], password: account.temporaryPassword },
      });
      await context.request.post(`${base}/api/auth/change-password`, {
        data: { password: "quota-test-password", confirmPassword: "quota-test-password" },
      });
      await context.request.post(`${base}/api/auth/login`, {
        data: { username: email.split("@")[0], password: "quota-test-password" },
      });
      keys.push({
        ...(await (
          await context.request.post(`${base}/api/keys`, { data: { name: "Quota test" } })
        ).json()),
        user: index,
      });
    }
    const owner = contexts[0].request;
    const other = contexts[1].request;
    const connection = await owner.post(`${base}/api/connections`, {
      data: {
        name: "Quota provider",
        baseUrl: process.env.TEST_PROVIDER_URL,
        apiKey: "connection-test-secret",
        visibility: "public",
        requestsPerMinute: 1,
        requestsPerDay: 10,
      },
    });
    expect(connection.status()).toBe(201);
    const id = (await connection.json()).id;
    connectionIds.push(id);
    const route = {
      modelAlias: "quota-chat",
      connectionId: id,
      upstreamModel: "fixture-model",
      priority: 0,
    };
    for (const context of contexts) {
      const result = await context.request.post(`${base}/api/routing-configs`, {
        data: { name: "Quota routing", isDefault: true, routes: [route] },
      });
      expect(result.status()).toBe(201);
      configIds.push((await result.json()).id);
    }
    keys.push({
      ...(await (
        await owner.post(`${base}/api/keys`, { data: { name: "Second key same user" } })
      ).json()),
      user: 0,
    });
    const chat = (key: string) =>
      request.post(`${gateway}/v1/chat/completions`, {
        headers: { Authorization: `Bearer ${key}` },
        data: { model: "quota-chat", messages: [{ role: "user", content: "OK" }] },
      });
    const concurrent = await Promise.all([chat(keys[0].key), chat(keys[2].key)]);
    expect(concurrent.map((r) => r.status()).sort()).toEqual([200, 429]);
    expect(
      Number(concurrent.find((r) => r.status() === 429)!.headers()["retry-after"]),
    ).toBeGreaterThan(0);
    expect((await chat(keys[1].key)).status()).toBe(200);
    expect(
      (
        await other.patch(`${base}/api/connections/${id}`, { data: { requestsPerDay: 100 } })
      ).status(),
    ).toBe(404);
    expect(
      (
        await owner.patch(`${base}/api/connections/${id}`, {
          data: { requestsPerMinute: 100, requestsPerDay: 2 },
        })
      ).status(),
    ).toBe(200);
    expect((await chat(keys[0].key)).status()).toBe(200);
    expect((await chat(keys[0].key)).status()).toBe(429);
    expect(
      (
        await owner.post(`${base}/api/connections/${id}/probe`, {
          data: { model: "fixture-model" },
        })
      ).status(),
    ).toBe(429);
    const ownerPage = await contexts[0].newPage();
    await ownerPage.goto(`${base}/connections`);
    const card = ownerPage.getByRole("article", { name: "Quota provider", exact: true });
    await card.getByText("Daily quota usage", { exact: true }).click();
    await expect(card.getByText(`${names[0]}: 2 / 2`, { exact: true })).toBeVisible();
    await expect(card.getByText(`${names[1]}: 1 / 2`, { exact: true })).toBeVisible();
    await card.getByText("Edit connection", { exact: true }).click();
    await card.getByLabel("Requests per minute per user").fill("90");
    await card.getByRole("button", { name: "Save changes" }).click();
    await expect(card.getByText("Changes saved", { exact: true })).toBeVisible();
    await expect(card.getByText(/Per user: 90 requests\/minute/)).toBeVisible();
    const otherPage = await contexts[1].newPage();
    await otherPage.goto(`${base}/connections`);
    const shared = otherPage.getByRole("article", { name: "Quota provider", exact: true });
    await shared.getByText("Daily quota usage", { exact: true }).click();
    await expect(shared.getByText(`${names[1]}: 1 / 2`, { exact: true })).toBeVisible();
    await expect(shared.getByText(names[0], { exact: false })).toHaveCount(0);
    const backup = await (
      await owner.post(`${base}/api/connections`, {
        data: {
          name: "Private quota backup",
          baseUrl: process.env.TEST_PROVIDER_URL,
          apiKey: "connection-test-secret",
        },
      })
    ).json();
    connectionIds.push(backup.id);
    await owner.put(`${base}/api/routing-configs/${configIds[0]}`, {
      data: {
        name: "Quota routing",
        isDefault: true,
        routes: [route, { ...route, connectionId: backup.id, priority: 1 }],
      },
    });
    expect((await chat(keys[0].key)).status()).toBe(200);
    const logs = (await (await owner.get(`${base}/api/request-logs`)).json()).requests;
    expect(logs[0].attempts.map((attempt: { reason: string }) => attempt.reason)).toEqual([
      "public connection quota exceeded",
      "response served",
    ]);
  } finally {
    for (const key of keys) await contexts[key.user].request.delete(`${base}/api/keys/${key.id}`);
    for (const [index, id] of configIds.entries())
      await contexts[index].request.delete(`${base}/api/routing-configs/${id}`);
    for (const id of connectionIds)
      await contexts[0].request.delete(`${base}/api/connections/${id}`);
    await Promise.all(contexts.map((context) => context.close()));
  }
});
