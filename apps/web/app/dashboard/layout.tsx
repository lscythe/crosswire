import type { ReactNode } from "react";
import { pageUser } from "../../lib/auth";
import { AppShell } from "../../components/app-shell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await pageUser();
  return <AppShell user={user}>{children}</AppShell>;
}
