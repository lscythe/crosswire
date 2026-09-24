import { ChipRoot as Chip } from "@heroui/react/chip";
import { IconChevronRight, IconLayoutSidebar, IconServer } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Nav } from "./nav";

export function AppShell({
  user,
  children,
}: {
  user: { role: "admin" | "member"; username: string; email: string };
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Nav role={user.role} username={user.username} />
      <div className="workspace">
        <header className="workspace-topbar">
          <div>
            <IconLayoutSidebar size={18} aria-hidden="true" />
            <span>Workspace</span>
            <IconChevronRight size={14} aria-hidden="true" />
            <strong>Crosswire</strong>
          </div>
          <Chip size="sm" variant="soft">
            <IconServer size={13} aria-hidden="true" />
            Self-hosted
          </Chip>
        </header>
        <main id="main-content" className="shell">
          {children}
        </main>
      </div>
    </div>
  );
}
