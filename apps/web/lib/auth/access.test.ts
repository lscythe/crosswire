import { beforeEach, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "session-token" }) }),
}));
vi.mock("../db", () => ({ query: vi.fn() }));

import { currentUser } from "../auth";
import { query } from "../db";

beforeEach(() => vi.resetAllMocks());
test("restricted sessions cannot access ordinary authenticated APIs", async () => {
  vi.mocked(query).mockResolvedValueOnce({
    rows: [{ id: "s", user_id: "u", expires_at: new Date(Date.now() + 60000) }],
  } as never);
  vi.mocked(query).mockResolvedValueOnce({
    rows: [{ id: "u", role: "member", must_change_password: true, disabled_at: null }],
  } as never);
  expect(await currentUser()).toBeNull();
});

test.each([
  [true, false, true, true],
  [false, false, false, true],
  [true, true, true, false],
])(
  "password-change access respects account state (%s, %s, %s)",
  async (restricted, disabled, allowChange, allowed) => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ id: "s", user_id: "u", expires_at: new Date(Date.now() + 60000) }],
    } as never);
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          id: "u",
          role: "member",
          must_change_password: restricted,
          disabled_at: disabled ? new Date() : null,
        },
      ],
    } as never);
    const user = await currentUser(allowChange);
    if (allowed) expect(user?.mustChangePassword).toBe(restricted);
    else expect(user).toBeNull();
  },
);
