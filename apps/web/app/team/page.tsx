import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { TeamInviteForm } from "../../components/team-invite-form";

export default async function TeamPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  const users = await query("SELECT id, email, name, role, disabled_at FROM users ORDER BY created_at");
  return <main className="shell"><h1>Team</h1><TeamInviteForm /><ul>{users.rows.map((member) => <li key={member.id}>{member.email} · {member.role}{member.disabled_at ? " · disabled" : ""}</li>)}</ul></main>;
}
