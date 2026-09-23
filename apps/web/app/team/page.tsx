import { AppShell } from "../../components/app-shell";
import { redirect } from "next/navigation";
import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { UserCreateForm } from "../../components/user-create-form";

export default async function TeamPage() {
  const user = await pageUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  const users = await query("SELECT id, email, name, role, disabled_at, must_change_password FROM users ORDER BY created_at");
  return <AppShell user={user}><h1>Team</h1><UserCreateForm /><ul>{users.rows.map((member) => <li key={member.id}>{member.email} · {member.role}{member.must_change_password ? " · password change required" : ""}{member.disabled_at ? " · disabled" : ""}</li>)}</ul></AppShell>;
}
