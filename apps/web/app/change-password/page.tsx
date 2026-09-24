import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";
import { PasswordChangeForm } from "../../components/password-change-form";
import { UserMenu } from "../../components/user-menu";

export default async function ChangePasswordPage() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");
  return <main className="auth"><h1>Change your password</h1><p>Choose a new password before continuing. Then sign in again.</p><PasswordChangeForm /><UserMenu username={user.username} /></main>;
}
