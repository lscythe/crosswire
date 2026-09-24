import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("personal routing CRUD, ordered fallback, isolation and request evidence", async ({ page, browser }) => {
  test.skip(!process.env.TEST_PROVIDER_URL, "Requires the local fixture provider");
  const providerUrl = process.env.TEST_PROVIDER_URL!;
  const gateway = process.env.GATEWAY_URL ?? "http://localhost:8080";
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin");
  await page.getByLabel("Password", { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "replace-with-a-long-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const base = new URL(page.url()).origin;
  const owner = await browser.newContext();
  const other = await browser.newContext();
  const connectionIds: string[] = [];
  const configIds: string[] = [];
  try {
    for (const context of [owner, other]) {
      const email = `routing-${randomUUID()}@example.com`;
      const account = await (await page.request.post("/api/users", { data: { username: email.split("@")[0], email } })).json();
      expect((await context.request.post(`${base}/api/auth/login`, { data: { username: email.split("@")[0], password: account.temporaryPassword } })).status()).toBe(200);
      expect((await context.request.post(`${base}/api/auth/change-password`, { data: { password: "routing-member-password", confirmPassword: "routing-member-password" } })).status()).toBe(200);
      await context.request.post(`${base}/api/auth/login`, { data: { username: email.split("@")[0], password: "routing-member-password" } });
    }
    const keys = [];
    for (const context of [owner, other]) keys.push((await (await context.request.post(`${base}/api/keys`, { data: { name: "routing check" } })).json()).key);
    const names = ["Failing provider", "Backup provider"];
    for (let i = 0; i < 2; i++) {
      const connection = await owner.request.post(`${base}/api/connections`, { data: { name: names[i], baseUrl: i === 0 ? providerUrl.replace('/v1', '/fail/v1') : providerUrl, apiKey: "connection-test-secret", visibility: "public" } });
      connectionIds.push((await connection.json()).id);
    }
    const routingPage = await owner.newPage();
    await routingPage.goto(`${base}/routing`);
    await routingPage.getByText("Create config", { exact: true }).click();
    const form = routingPage.locator('form').first();
    await form.getByLabel("Config name", { exact: true }).fill("Team routing");
    await form.getByLabel("Use as default").check();
    await form.getByLabel("Model alias", { exact: true }).fill("team-chat");
    await form.getByRole("combobox").selectOption(connectionIds[0]);
    await form.getByLabel("Upstream model", { exact: true }).fill("primary-model");
    await form.getByRole("button", { name: "Add route", exact: true }).click();
    await form.getByLabel("Model alias", { exact: true }).nth(1).fill("team-chat");
    await form.getByRole("combobox").nth(1).selectOption(connectionIds[1]);
    await form.getByLabel("Upstream model", { exact: true }).nth(1).fill("backup-model");
    await form.getByRole("button", { name: "Save routing", exact: true }).click();
    const card = routingPage.getByRole("article", { name: "Team routing", exact: true });
    await expect(card).toBeVisible();
    await routingPage.setViewportSize({ width: 390, height: 844 });
    expect(await routingPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await routingPage.screenshot({ path: "test-results/routing-mobile.png", fullPage: true });
    const configs = async () => (await (await owner.request.get(`${base}/api/routing-configs`)).json()).configs;
    let cfg = (await configs())[0];
    configIds.push(cfg.id);
    const chat = (key: string, requestId = randomUUID()) => owner.request.post(`${gateway}/v1/chat/completions`, { headers: { Authorization: `Bearer ${key}`, "X-Request-ID": requestId }, data: { model: "team-chat", messages: [{ role: "user", content: "OK" }] } });
    // A shared provider must never make another user's config apply to this caller.
    expect((await chat(keys[1])).status()).toBe(404);
    const requestId = randomUUID();
    const response = await chat(keys[0], requestId);
    expect(response.status()).toBe(200);
    expect((await response.json()).model).toBe("backup-model");
    const logs = async () => (await (await owner.request.get(`${base}/api/request-logs`)).json()).requests;
    await expect.poll(async () => (await logs()).find((log: { request_id: string }) => log.request_id === requestId)?.attempts.length).toBe(2);
    const log = (await logs()).find((item: { request_id: string }) => item.request_id === requestId);
    expect(log.connection_id).toBe(connectionIds[1]);
    expect(log.attempts.map((item: { reason: string }) => item.reason)).toEqual(["upstream server error", "response served"]);
    expect(JSON.stringify(log)).not.toContain("connection-test-secret");
    await routingPage.goto(`${base}/usage`);
    await expect(routingPage.getByText("Served by: Backup provider", { exact: true })).toBeVisible();
    await routingPage.getByText("Routing attempts (2)", { exact: true }).click();
    await expect(routingPage.getByText(/Failing provider · primary-model · HTTP 503/)).toBeVisible();
    await routingPage.goto(`${base}/routing`);
    await card.getByText("Edit config", { exact: true }).click();
    await card.getByRole("button", { name: "Move up", exact: true }).nth(1).click();
    await card.getByRole("button", { name: "Save routing", exact: true }).click();
    await expect.poll(async () => (await configs())[0].routes[0].connectionId).toBe(connectionIds[1]);
    const directId = randomUUID();
    expect((await chat(keys[0], directId)).status()).toBe(200);
    await expect.poll(async () => (await logs()).find((item: { request_id: string }) => item.request_id === directId)?.attempts.length).toBe(1);
    cfg = (await configs())[0];
    // Invalid routes reject the whole mutation, preserving the active config.
    const bad = { name: "bad", isDefault: true, routes: [{ ...cfg.routes[0], connectionId: randomUUID() }] };
    expect((await owner.request.post(`${base}/api/routing-configs`, { data: bad })).status()).toBe(400);
    expect((await owner.request.put(`${base}/api/routing-configs/${cfg.id}`, { data: bad })).status()).toBe(400);
    expect((await configs())[0].name).toBe("Team routing");
    expect((await configs())[0].is_default).toBe(true);
    await owner.request.patch(`${base}/api/connections/${connectionIds[1]}`, { data: { enabled: false } });
    expect((await owner.request.put(`${base}/api/routing-configs/${cfg.id}`, { data: { name: cfg.name, isDefault: true, routes: cfg.routes } })).status()).toBe(400);
    await owner.request.patch(`${base}/api/connections/${connectionIds[1]}`, { data: { enabled: true } });
    for (const method of ["patch", "delete", "put"] as const) {
      expect((await other.request[method](`${base}/api/routing-configs/${cfg.id}`, { data: method === "put" ? { name: "stolen", routes: cfg.routes } : { isDefault: true } })).status()).toBe(404);
    }
    const second = await (await owner.request.post(`${base}/api/routing-configs`, { data: { name: "Alternative", routes: cfg.routes } })).json();
    configIds.push(second.id);
    await routingPage.reload();
    await routingPage.getByRole("article", { name: "Alternative", exact: true }).getByRole("button", { name: "Make default" }).click();
    await expect.poll(async () => (await configs()).filter((item: { is_default: boolean }) => item.is_default).map((item: { id: string }) => item.id)).toEqual([second.id]);
    // Concurrent default updates leave exactly one default.
    const switches = await Promise.all(configIds.map(id => owner.request.patch(`${base}/api/routing-configs/${id}`, { data: { isDefault: true } })));
    expect(switches.map(response => response.status())).toEqual([200, 200]);
    expect((await configs()).filter((item: { is_default: boolean }) => item.is_default)).toHaveLength(1);
    await owner.request.patch(`${base}/api/routing-configs/${cfg.id}`, { data: { isDefault: true } });
    // Stop on 4xx; never use the backup for an authentication error.
    await owner.request.patch(`${base}/api/connections/${connectionIds[1]}`, { data: { baseUrl: providerUrl.replace('/v1', '/deny/v1') } });
    expect((await chat(keys[0])).status()).toBe(401);
    // Transport failure falls back; all failures produce an explainable 502.
    await owner.request.patch(`${base}/api/connections/${connectionIds[1]}`, { data: { baseUrl: providerUrl.replace('/v1', '/drop/v1') } });
    const failedId = randomUUID();
    expect((await chat(keys[0], failedId)).status()).toBe(502);
    await expect.poll(async () => (await logs()).find((item: { request_id: string }) => item.request_id === failedId)?.attempts[0].reason).toBe("transport error");
    // A formerly public connection is no longer routable by other users.
    const foreign = await (await other.request.post(`${base}/api/routing-configs`, { data: { name: "Shared", isDefault: true, routes: [cfg.routes[0]] } })).json();
    await owner.request.patch(`${base}/api/connections/${connectionIds[1]}`, { data: { visibility: "private" } });
    expect((await chat(keys[1])).status()).toBe(404);
    await other.request.delete(`${base}/api/routing-configs/${foreign.id}`);
    await routingPage.reload();
    routingPage.once("dialog", dialog => dialog.accept());
    await card.getByRole("button", { name: "Delete config" }).click();
    await expect(card).toHaveCount(0);
    expect((await chat(keys[0])).status()).toBe(404);
  } finally {
    for (const id of configIds) await owner.request.delete(`${base}/api/routing-configs/${id}`, { timeout: 2000 }).catch(() => {});
    for (const id of connectionIds) await owner.request.delete(`${base}/api/connections/${id}`, { timeout: 2000 }).catch(() => {});
    await owner.close(); await other.close();
  }
});
