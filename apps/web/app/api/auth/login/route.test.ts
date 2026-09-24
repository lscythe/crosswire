import { beforeEach, expect, it, vi } from "vitest";

vi.mock("../../../../lib/db", () => ({ withTransaction: vi.fn() }));
vi.mock("../../../../lib/auth", () => ({
  hashOpaqueToken: () => "hash",
  sessionCookie: () => ({ name: "session", value: "token" }),
}));
vi.mock("../../../../lib/auth/password", () => ({ verifyPassword: vi.fn() }));

import { verifyPassword } from "../../../../lib/auth/password";
import { withTransaction } from "../../../../lib/db";
import { createUserSchema } from "../../../../lib/validation";
import { POST } from "./route";

const query = vi.fn();
const account = {
  id: "user",
  username: "alice",
  email: "contact@example.com",
  password_hash: "secret-hash",
  role: "member",
  must_change_password: true,
};
const request = (body: unknown) =>
  new Request("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withTransaction).mockImplementation(async (fn) => fn({ query } as never));
  vi.mocked(verifyPassword).mockResolvedValue(true);
  query.mockResolvedValue({ rows: [account] });
});
it("normalizes username and retains the first-login password requirement", async () => {
  const response = await POST(request({ username: " ALICE ", password: "valid-password" }));
  expect(response.status).toBe(200);
  expect(query.mock.calls[0][0]).toContain("WHERE username = $1 FOR UPDATE");
  expect(query.mock.calls[0][1]).toEqual(["alice"]);
  expect(await response.json()).toMatchObject({ username: "alice", mustChangePassword: true });
  expect(query.mock.calls[1][0]).toContain("INSERT INTO sessions");
});
it.each([
  { email: "alice@example.com", password: "valid-password" },
  { username: "alice@example.com", password: "valid-password" },
  { username: "ab", password: "valid-password" },
  { username: "a".repeat(65), password: "valid-password" },
])("rejects malformed login before querying: %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(query).not.toHaveBeenCalled();
});
it.each(["missing", "disabled", "password"])(
  "rejects %s accounts without creating a session",
  async (reason) => {
    query.mockResolvedValue({
      rows:
        reason === "missing"
          ? []
          : [{ ...account, disabled_at: reason === "disabled" ? new Date() : null }],
    });
    if (reason === "password") vi.mocked(verifyPassword).mockResolvedValue(false);
    const response = await POST(request({ username: "alice", password: "wrong-password" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid credentials" });
    expect(query).toHaveBeenCalledTimes(1);
  },
);
it("requires explicit valid usernames when creating accounts", () => {
  expect(createUserSchema.safeParse({ email: "user@example.com" }).success).toBe(false);
  expect(
    createUserSchema.parse({ username: " Alice_1 ", email: "user@example.com" }).username,
  ).toBe("alice_1");
});
