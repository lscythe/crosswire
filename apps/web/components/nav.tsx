import Link from "next/link";

export function Nav({ role }: { role: "admin" | "member" }) {
  return <nav className="nav" aria-label="Main navigation">
    <Link href="/dashboard">Dashboard</Link>
    {role === "admin" && <Link href="/team">Team</Link>}
  </nav>;
}
