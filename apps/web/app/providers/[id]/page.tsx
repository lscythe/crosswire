import { CardRoot as Card } from "@heroui/react/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { ConnectionCard } from "../../../components/connection-card";
import { type KeyView, ProviderKeys } from "../../../components/provider-keys";
import { ProviderModels } from "../../../components/provider-models";
import { pageUser } from "../../../lib/auth";
import { query } from "../../../lib/db";
import type { ProviderModel } from "../../../lib/provider-models";
import { providerViews } from "../../../lib/provider-store";
import { providerAccess } from "../../../lib/providers";

export default async function ProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  const provider = await providerAccess(id, user);
  if (!provider) notFound();
  const canManage = user.role === "admin" || provider.owner_user_id === user.id;
  const [views, keys, models, history] = await Promise.all([
    providerViews(user),
    query<KeyView>(
      "SELECT id, name, enabled, last_test_status FROM provider_keys WHERE provider_id = $1 ORDER BY created_at, id",
      [id],
    ),
    query<ProviderModel>(
      "SELECT id, upstream_id, display_name, enabled, imported_metadata, overrides, discovered_by_key_id, imported_at FROM provider_models WHERE provider_id = $1 ORDER BY upstream_id",
      [id],
    ),
    query<{ id: string; requested_model: string; overall_status: string; created_at: Date }>(
      "SELECT id, requested_model, overall_status, created_at FROM probe_runs WHERE connection_id = $1 ORDER BY created_at DESC LIMIT 20",
      [id],
    ),
  ]);
  const connection = views.rows.find((item) => item.id === id);
  if (!connection) notFound();
  return (
    <AppShell user={user}>
      <Link className="text-link" href="/providers">
        All providers
      </Link>
      <h1>{provider.name}</h1>
      <p>Provider settings, credentials, models, and observed capabilities.</p>
      <nav className="provider-tabs" aria-label="Provider sections">
        <a href="#overview">Overview & probes</a>
        <a href="#keys">API keys</a>
        <a href="#models">Models</a>
        <a href="#history">Probe history</a>
      </nav>
      <section id="overview">
        <ConnectionCard
          connection={{ ...connection, canManage }}
          keys={keys.rows}
          selectedKeyId={provider.selected_key_id}
          catalog={models.rows}
        />
      </section>
      <section id="keys">
        <ProviderKeys
          providerId={id}
          keys={keys.rows}
          mode={provider.key_mode}
          selectedKeyId={provider.selected_key_id}
          canManage={canManage}
        />
      </section>
      <section id="models">
        <ProviderModels
          providerId={id}
          models={models.rows}
          keys={keys.rows}
          selectedKeyId={provider.selected_key_id}
          canManage={canManage}
        />
      </section>
      <Card id="history" className="connection-card">
        <h2>Probe history</h2>
        {history.rows.length ? (
          <ul>
            {history.rows.map((run) => (
              <li key={run.id}>
                {run.requested_model} · {run.overall_status} · {run.created_at.toISOString()}
              </li>
            ))}
          </ul>
        ) : (
          <p>No probes yet.</p>
        )}
        <Link className="text-link" href="/probes">
          All probe evidence
        </Link>
      </Card>
    </AppShell>
  );
}
