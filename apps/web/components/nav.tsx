"use client";
import { Chip } from "@heroui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconActivity, IconArrowsSplit, IconBolt, IconChartBar, IconDashboard, IconKey, IconPlugConnected, IconUsers } from "@tabler/icons-react";
import { UserMenu } from "./user-menu";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { href: "/api-access", label: "API access", icon: IconKey },
  { href: "/connections", label: "Connections", icon: IconPlugConnected },
  { href: "/routing", label: "Routing", icon: IconArrowsSplit },
  { href: "/usage", label: "Usage", icon: IconChartBar },
  { href: "/probes", label: "Probes", icon: IconActivity },
];
export function Nav({ role, username }: { role: "admin" | "member"; username: string }) {
  const pathname = usePathname();
  return <aside className="sidebar">
    <Link className="brand" href="/dashboard"><span className="brand-mark"><IconBolt size={21} aria-hidden="true" /></span>Crosswire</Link>
    <div className="workspace-picker"><span className="workspace-avatar">CW</span><div><strong>Team workspace</strong><span>Personal gateway</span></div><Chip size="sm" variant="soft">{role}</Chip></div><div className="workspace-label">Workspace</div>
    <nav className="nav" aria-label="Main navigation">
      {[...links, ...(role === "admin" ? [{ href: "/team", label: "Team", icon: IconUsers }] : [])].map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={19} stroke={1.7} aria-hidden="true" /><span>{label}</span></Link>)}
    </nav>
    <div className="sidebar-footer"><UserMenu username={username} /></div>
  </aside>;
}
