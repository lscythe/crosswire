import Link from "next/link";

export function Nav({ role }: { role: "admin" | "member" }) {
  return <nav className="nav" aria-label="Main navigation">
    <Link href="/dashboard">Dashboard</Link>
    <Link href="/connections">Connections</Link>
    <Link href="/probes">Probes</Link>
    <Link href="/usage">Usage</Link>
    {role === "admin" && <Link href="/team">Team</Link>}
  </nav>;
}
