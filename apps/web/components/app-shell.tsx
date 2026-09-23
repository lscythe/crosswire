import type { ReactNode } from "react";
import { Nav } from "./nav";

export function AppShell({ user, children }: { user: { role: "admin" | "member"; email: string }; children: ReactNode }) {
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><Nav role={user.role} email={user.email} /><main id="main-content" className="shell">{children}</main></div>;
}
