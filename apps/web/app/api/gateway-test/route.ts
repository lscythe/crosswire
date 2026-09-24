import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "../../../lib/auth";
import { hashApiKey } from "../../../lib/auth/apikey";
import { query } from "../../../lib/db";

const schema = z.object({ key: z.string().startsWith("cw_live_").min(20).max(256) });
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "paste a valid Crosswire key" }, { status: 400 });
  const result = await query(
    "SELECT id FROM api_keys WHERE user_id = $1 AND key_hash = $2 AND revoked_at IS NULL",
    [user.id, hashApiKey(body.data.key)],
  );
  if (!result.rows[0])
    return NextResponse.json({ error: "key is not active for this account" }, { status: 400 });
  const started = Date.now();
  try {
    const response = await fetch(
      `${process.env.GATEWAY_INTERNAL_URL ?? "http://gateway:8080"}/v1/models`,
      {
        redirect: "error",
        headers: { Authorization: `Bearer ${body.data.key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      modelCount: Array.isArray(payload?.data) ? payload.data.length : 0,
      latencyMs: Date.now() - started,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      status: 0,
      modelCount: 0,
      latencyMs: Date.now() - started,
    });
  }
}
