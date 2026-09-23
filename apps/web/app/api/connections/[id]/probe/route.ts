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
  const body = await request.json().catch(() => null) as { model?: string } | null;
  const requestedModel = body?.model?.trim();
  if (!requestedModel) return NextResponse.json({ error: "model is required" }, { status: 400 });
  const connection = await query<{ owner_user_id: string; base_url: string; api_key_ciphertext: string; visibility: string }>("SELECT owner_user_id, base_url, api_key_ciphertext, visibility FROM connections WHERE id = $1 AND enabled", [id]);
  const row = connection.rows[0];
  if (!row || (user.role !== "admin" && row.owner_user_id !== user.id && row.visibility !== "public")) return NextResponse.json({ error: "not found" }, { status: 404 });
  const checks: ProbeCheck[] = [];
  let returnedModel: string | null = null;
  let metadata: Record<string, unknown> = {};
  try {
    const response = await fetch(`${row.base_url.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${decryptSecret(row.api_key_ciphertext)}` }, body: JSON.stringify({ model: requestedModel, messages: [{ role: "user", content: "Reply with exactly OK." }], max_tokens: 8 }), signal: AbortSignal.timeout(15000) });
    const json = await response.json().catch(() => ({}));
    returnedModel = typeof json.model === "string" ? json.model : null;
    metadata = { httpStatus: response.status, returnedModel, responseId: json.id ?? null };
    checks.push({ capability: "chat", passed: response.ok && typeof json.choices?.[0]?.message?.content === "string", evidence: metadata });
    const streamResponse = await fetch(`${row.base_url.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${decryptSecret(row.api_key_ciphertext)}` }, body: JSON.stringify({ model: requestedModel, stream: true, messages: [{ role: "user", content: "Reply with exactly OK." }], max_tokens: 8 }), signal: AbortSignal.timeout(15000) });
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
