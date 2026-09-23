import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";

export default async function TeamPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  return <main className="shell"><h1>Team</h1></main>;
}
