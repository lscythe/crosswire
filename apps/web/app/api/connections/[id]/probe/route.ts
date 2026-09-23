import { z } from "zod";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { query } from "../../../../../lib/db";
import { decryptSecret } from "../../../../../lib/secrets";
import { identityConfidence, overallStatus, type ProbeCheck } from "../../../../../lib/probe";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Params) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = z.object({ model: z.string().trim().min(1).max(200) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "model is required" }, { status: 400 });
  const requestedModel = body.data.model;
  const connection = await query<{ owner_user_id: string; base_url: string; api_key_ciphertext: string; visibility: string }>("SELECT owner_user_id, base_url, api_key_ciphertext, visibility FROM connections WHERE id = $1 AND enabled", [id]);
  const row = connection.rows[0];
  if (!row || (user.role !== "admin" && row.owner_user_id !== user.id && row.visibility !== "public")) return NextResponse.json({ error: "not found" }, { status: 404 });
  let retryAfter: number;
  try {
    const reservation = await query<{ retry_after: number }>("SELECT reserve_connection_requests($1, $2, 2) AS retry_after", [id, user.id]);
    retryAfter = reservation.rows[0].retry_after;
  } catch { return NextResponse.json({ error: "quota check unavailable" }, { status: 503 }); }
  if (retryAfter < 0) return NextResponse.json({ error: "connection unavailable" }, { status: 404 });
  if (retryAfter > 0) return NextResponse.json({ error: "public connection quota exceeded", retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  const checks: ProbeCheck[] = [];
  let returnedModel: string | null = null;
  let metadata: Record<string, unknown> = {};
  try {
    const response = await fetch(`${row.base_url.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${decryptSecret(row.api_key_ciphertext)}` }, body: JSON.stringify({ model: requestedModel, messages: [{ role: "user", content: "Reply with exactly OK." }], max_tokens: 8 }), redirect: "error", signal: AbortSignal.timeout(15000) });
    const json = await response.json().catch(() => ({}));
    returnedModel = typeof json.model === "string" ? json.model : null;
    metadata = { httpStatus: response.status, returnedModel, responseId: json.id ?? null };
    checks.push({ capability: "chat", passed: response.ok && typeof json.choices?.[0]?.message?.content === "string", evidence: metadata });
    const streamResponse = await fetch(`${row.base_url.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${decryptSecret(row.api_key_ciphertext)}` }, body: JSON.stringify({ model: requestedModel, stream: true, messages: [{ role: "user", content: "Reply with exactly OK." }], max_tokens: 8 }), redirect: "error", signal: AbortSignal.timeout(15000) });
    checks.push({ capability: "streaming", passed: streamResponse.ok && (streamResponse.headers.get("content-type") ?? "").includes("text/event-stream"), evidence: { httpStatus: streamResponse.status, contentType: streamResponse.headers.get("content-type") } });
    await streamResponse.body?.cancel();
  } catch (error) {
    checks.push({ capability: "chat", passed: false, evidence: { error: error instanceof Error ? error.message : "probe failed" } });
  }
  const confidence = identityConfidence(requestedModel, returnedModel, metadata);
  const status = overallStatus(checks);
  const result = await query<{ id: string }>("INSERT INTO probe_runs(connection_id, requested_model, claimed_model, identity_confidence, overall_status, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", [id, requestedModel, returnedModel, confidence, status, user.id]);
  for (const check of checks) await query("INSERT INTO probe_results(probe_run_id, capability, passed, evidence) VALUES ($1, $2, $3, $4)", [result.rows[0].id, check.capability, check.passed, JSON.stringify(check.evidence)]);
  return NextResponse.json({ id: result.rows[0].id, requestedModel, returnedModel, identityConfidence: confidence, status, limitation: "Response behavior cannot cryptographically prove model identity.", checks });
}
