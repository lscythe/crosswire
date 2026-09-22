import { query } from "./db";

export async function recordAudit(actorUserId: string | null, action: string, resourceType: string, resourceId: string | null, metadata: Record<string, unknown> = {}) {
  await query(
    "INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1, $2, $3, $4, $5)",
    [actorUserId, action, resourceType, resourceId, JSON.stringify(metadata)],
  );
}
