import { CardRoot as Card } from "@heroui/react/card";
import { ChipRoot as Chip } from "@heroui/react/chip";
import { AppShell } from "../../components/app-shell";
import { redirect } from "next/navigation";
import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { UserCreateForm } from "../../components/user-create-form";

export default async function TeamPage() {
  const user = await pageUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  const users = await query("SELECT id, username, email, name, role, disabled_at, must_change_password FROM users ORDER BY created_at");
  return <AppShell user={user}><h1>Team</h1><p>Your workspace, your people. Manage access in one place.</p><Card className="connection-card"><h2>Add a teammate</h2><UserCreateForm /></Card><Card className="activity-card"><h2>Workspace members</h2><ul className="member-list">{users.rows.map((member) => <li key={member.id}><div><strong>{member.username}</strong><p>{member.email}</p></div><div className="connection-actions"><Chip size="sm" variant="soft" color={member.role === "admin" ? "accent" : "default"}>{member.role}</Chip>{member.must_change_password && <Chip size="sm" variant="soft" color="warning">password change required</Chip>}{member.disabled_at && <Chip size="sm" variant="soft">disabled</Chip>}</div></li>)}</ul></Card></AppShell>;
}
