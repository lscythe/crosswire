import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { currentUser } from "../../lib/auth";
import { Nav } from "../../components/nav";
import { UserMenu } from "../../components/user-menu";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <div className="shell">
    <header className="topbar"><h1>Crosswire</h1><Nav role={user.role} /><UserMenu email={user.email} /></header>
    <main>{children}</main>
  </div>;
}
