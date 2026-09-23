import Link from "next/link";

export function Nav({ role }: { role: "admin" | "member" }) {
  return <nav className="nav" aria-label="Main navigation">
    <Link href="/dashboard">Dashboard</Link>
    <Link href="/api-access">API access</Link>
    <Link href="/connections">Connections</Link>
    <Link href="/probes">Probes</Link>
    <Link href="/usage">Usage</Link>
    <Link href="/routing">Routing</Link>
    {role === "admin" && <Link href="/team">Team</Link>}
  </nav>;
}
