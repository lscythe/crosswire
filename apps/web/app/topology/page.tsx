import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { RouteGraph } from "../../components/route-graph";
import { pageUser } from "../../lib/auth";

export default async function TopologyPage() {
  const user = await pageUser();
  return (
    <AppShell user={user}>
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">Workspace topology</div>
          <h1>Route graph</h1>
          <p>Live request flow from clients through Crosswire to your providers.</p>
        </div>
        <Link className="button button--secondary" href="/providers">
          Manage providers
        </Link>
      </div>
      <RouteGraph mode="full" />
    </AppShell>
  );
}
