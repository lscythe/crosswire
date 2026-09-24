import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("personal keys and model discovery follow active routing permissions", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("Username", { exact: true })
    .fill(process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "replace-with-a-long-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const base = new URL(page.url()).origin;
  const context = await browser.newContext();
  const email = `keys-${randomUUID()}@example.com`;
  const account = await (
    await page.request.post("/api/users", { data: { username: email.split("@")[0], email } })
  ).json();
  await context.request.post(`${base}/api/auth/login`, {
    data: { username: email.split("@")[0], password: account.temporaryPassword },
  });
  await context.request.post(`${base}/api/auth/change-password`, {
    data: { password: "api-access-password", confirmPassword: "api-access-password" },
  });
  await context.request.post(`${base}/api/auth/login`, {
    data: { username: email.split("@")[0], password: "api-access-password" },
  });
  const member = await context.newPage();
  let connectionId: string | undefined;
  let configId: string | undefined;
  let keyId: string | undefined;
  try {
    await member.goto(`${base}/api-access`);
    await member.getByLabel("Key name").fill("Client test");
    const created = member.waitForResponse(
      (response) => response.url().endsWith("/api/keys") && response.request().method() === "POST",
    );
    await member.getByRole("button", { name: "Create key", exact: true }).click();
    const response = await created;
    expect(response.headers()["cache-control"]).toBe("no-store");
    const key = await response.json();
    keyId = key.id;
    await expect(member.getByLabel("New API key")).toHaveValue(key.key);
    await member.getByRole("button", { name: "Test request", exact: true }).click();
    await expect(member.getByText(/Gateway reachable/)).toBeVisible();
    await expect(member.getByText(/Last used .*Never/)).toHaveCount(0);
    const gateway = process.env.GATEWAY_URL ?? "http://localhost:8080";
    const models = () =>
      context.request.get(`${gateway}/v1/models`, {
        headers: { Authorization: `Bearer ${key.key}` },
      });
    expect(await (await models()).json()).toEqual({ object: "list", data: [] });
    const connection = await (
      await page.request.post("/api/connections", {
        data: {
          name: "Discovery only",
          baseUrl: process.env.TEST_PROVIDER_URL ?? "http://web:4100/v1",
          apiKey: "connection-test-secret",
          visibility: "public",
        },
      })
    ).json();
    connectionId = connection.id;
    const route = {
      modelAlias: "team-chat",
      connectionId,
      upstreamModel: "provider-model",
      priority: 0,
    };
    const config = await (
      await context.request.post(`${base}/api/routing-configs`, {
        data: { name: "Discovery", isDefault: true, routes: [route, { ...route, priority: 1 }] },
      })
    ).json();
    configId = config.id;
    const listed = await (await models()).json();
    expect(listed.data).toEqual([
      { id: "team-chat", object: "model", created: 0, owned_by: "crosswire" },
    ]);
    expect(JSON.stringify(listed)).not.toContain("provider-model");
    await member.reload();
    await expect(member.getByLabel("New API key")).toHaveCount(0);
    await expect(member.getByText("team-chat", { exact: true })).toBeVisible();
    expect(await member.locator("pre").innerText()).toContain("$CROSSWIRE_API_KEY");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    for (const [language, text] of [
      ["Python", "from openai import OpenAI"],
      ["Node", 'import OpenAI from "openai"'],
    ]) {
      await member.getByRole("button", { name: language, exact: true }).click();
      await expect(member.locator("pre")).toContainText(text);
      await member.getByRole("button", { name: "Copy example", exact: true }).click();
      expect(await member.evaluate(() => navigator.clipboard.readText())).toBe(
        await member.locator("pre").innerText(),
      );
    }
    await member.getByLabel("Test request with key").fill(key.key);
    await member.getByRole("button", { name: "Test request", exact: true }).click();
    await expect(member.getByText(/Gateway reachable. 1 aliases/)).toBeVisible();
    await member.getByRole("button", { name: "Check health", exact: true }).click();
    await expect(member.getByText(/Discovery only · healthy/)).toBeVisible();
    expect(await member.locator("body").innerText()).not.toContain("connection-test-secret");
    const failedUrl = (process.env.TEST_PROVIDER_URL ?? "http://web:4100/v1").replace(
      /\/v1$/,
      "/fail",
    );
    await page.request.patch(`/api/connections/${connectionId}`, { data: { baseUrl: failedUrl } });
    await member.getByRole("button", { name: "Check health", exact: true }).click();
    await expect(member.getByText(/Discovery only · degraded.*HTTP 503/)).toBeVisible();
    await page.request.patch(`/api/connections/${connectionId}`, {
      data: { baseUrl: process.env.TEST_PROVIDER_URL ?? "http://web:4100/v1" },
    });
    expect(await member.locator("body").innerText()).not.toContain(key.key);
    expect(
      JSON.stringify(await (await context.request.get(`${base}/api/keys`)).json()),
    ).not.toContain(key.key);
    expect((await page.request.delete(`/api/keys/${keyId}`)).status()).toBe(404);
    await page.request.patch(`/api/connections/${connectionId}`, { data: { enabled: false } });
    expect((await (await models()).json()).data).toEqual([]);
    await page.request.patch(`/api/connections/${connectionId}`, {
      data: { enabled: true, visibility: "private" },
    });
    expect((await (await models()).json()).data).toEqual([]);
    await page.request.patch(`/api/connections/${connectionId}`, {
      data: { visibility: "public" },
    });
    await context.request.put(`${base}/api/routing-configs/${configId}`, {
      data: { name: "Discovery", isDefault: false, routes: [route] },
    });
    expect((await (await models()).json()).data).toEqual([]);
    member.once("dialog", (dialog) => dialog.accept());
    await member.getByRole("button", { name: "Revoke Client test", exact: true }).click();
    await expect(member.getByText("Key revoked", { exact: true })).toBeVisible();
    expect((await models()).status()).toBe(401);
    await member.setViewportSize({ width: 390, height: 844 });
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    if (keyId) await context.request.delete(`${base}/api/keys/${keyId}`);
    if (configId) await context.request.delete(`${base}/api/routing-configs/${configId}`);
    if (connectionId) await page.request.delete(`/api/connections/${connectionId}`);
    await context.close();
  }
});
