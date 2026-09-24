import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "../../../../../lib/auth";
import { query, withTransaction } from "../../../../../lib/db";
import { identityConfidence, overallStatus } from "../../../../../lib/probe";
import { probeCapabilities, runBehaviorProbe } from "../../../../../lib/probe-behavior";
import { providerAccess, providerKey, uuid } from "../../../../../lib/providers";
import { decryptSecret } from "../../../../../lib/secrets";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = z
    .object({
      model: z.string().trim().min(1).max(200),
      keyId: uuid.optional(),
      capabilities: z.array(z.enum(probeCapabilities)).min(1).max(4).default(["chat", "streaming"]),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "Invalid probe configuration" }, { status: 400 });
  const provider = await providerAccess(id, user);
  if (
    !provider ||
    provider.enabled === false ||
    (user.role !== "admin" &&
      provider.owner_user_id !== user.id &&
      provider.visibility &&
      provider.visibility !== "public")
  )
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const checksToRun = [...new Set(body.data.capabilities)];
  // Reserve per check so the same provider/user quota applies to every upstream request.
  const results = [];
  let selectedKey: { id: string; ciphertext: string } | null = null;
  for (const capability of checksToRun) {
    let retryAfter: number;
    try {
      retryAfter = (
        await query<{ retry_after: number }>(
          "SELECT reserve_connection_requests($1, $2, 1) AS retry_after",
          [id, user.id],
        )
      ).rows[0].retry_after;
    } catch {
      return NextResponse.json({ error: "quota check unavailable" }, { status: 503 });
    }
    if (retryAfter < 0)
      return NextResponse.json({ error: "provider unavailable" }, { status: 404 });
    if (retryAfter > 0)
      return NextResponse.json(
        { error: "public provider quota exceeded", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    const key = await providerKey(provider, body.data.keyId);
    if (!key)
      return NextResponse.json({ error: "Select an enabled provider key" }, { status: 400 });
    selectedKey = key;
    results.push(
      await runBehaviorProbe(
        provider.base_url,
        decryptSecret(key.ciphertext),
        body.data.model,
        capability,
      ),
    );
  }
  const checks = results.map((result) => result.check);
  const returnedModel = results.find((result) => result.returnedModel)?.returnedModel ?? null;
  const confidence = identityConfidence(body.data.model, returnedModel, {});
  const status = overallStatus(checks);
  const runId = await withTransaction(async (client) => {
    const run = await client.query<{ id: string }>(
      "INSERT INTO probe_runs(connection_id, requested_model, claimed_model, identity_confidence, overall_status, created_by, provider_key_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
      [id, body.data.model, returnedModel, confidence, status, user.id, selectedKey?.id ?? null],
    );
    for (const check of checks)
      await client.query(
        "INSERT INTO probe_results(probe_run_id, capability, passed, evidence) VALUES ($1, $2, $3, $4)",
        [run.rows[0].id, check.capability, check.passed, JSON.stringify(check.evidence)],
      );
    await client.query(
      "INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id) VALUES ($1, 'provider.probed', 'connection', $2)",
      [user.id, id],
    );
    return run.rows[0].id;
  });
  return NextResponse.json({
    id: runId,
    requestedModel: body.data.model,
    returnedModel,
    identityConfidence: confidence,
    status,
    limitation: "Behavior and provider claims cannot prove model identity.",
    checks,
  });
}
