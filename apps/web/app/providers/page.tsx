import { CardRoot as Card } from "@heroui/react/card";
import { ChipRoot as Chip } from "@heroui/react/chip";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { ConnectionForm } from "../../components/connection-form";
import { pageUser } from "../../lib/auth";
import { providerViews } from "../../lib/provider-store";

export default async function ProvidersPage() {
  const user = await pageUser();
  const result = await providerViews(user);
  return (
    <AppShell user={user}>
      <h1>Providers</h1>
      <p>Shared access, API keys, and your model catalog.</p>
      <details className="connection-card">
        <summary>Add provider</summary>
        <ConnectionForm />
      </details>
      {!result.rows.length && <p>No providers yet. Add your first provider above.</p>}
      <div className="connections-grid">
        {result.rows.map((provider) => (
          <Card role="article" className="connection-card" key={provider.id}>
            <h2>
              <Link href={`/providers/${provider.id}`}>{provider.name}</Link>
            </h2>
            <p className="connection-url">{provider.base_url}</p>
            <div className="connection-actions">
              <Chip size="sm" variant="soft">
                {provider.visibility}
              </Chip>
              <Chip size="sm" color={provider.enabled ? "success" : "default"} variant="soft">
                {provider.enabled ? "Enabled" : "Disabled"}
              </Chip>
            </div>
            <Link className="text-link" href={`/providers/${provider.id}`}>
              Manage provider
            </Link>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
