"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function UserCreateForm() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setPending(true);
    setError("");
    setCredentials(null);
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), role: form.get("role") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create user");
      setCredentials(body);
      element.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create user");
    } finally {
      setPending(false);
    }
  }
  return <><form onSubmit={submit}>
    <label className="field">User email<input name="email" type="email" required /></label>
    <label className="field">Role<select name="role" defaultValue="member"><option value="member">Member</option><option value="admin">Admin</option></select></label>
    <button className="primary" disabled={pending}>{pending ? "Creating..." : "Create user"}</button>
    {error && <p role="alert">{error}</p>}
  </form>{credentials && <div role="status"><p>Share these credentials privately. This temporary password is shown only now.</p><p>{credentials.email}</p><label className="field">Temporary password<input readOnly value={credentials.temporaryPassword} /></label><p>A password change is required at first login.</p><button type="button" onClick={() => setCredentials(null)}>Dismiss credentials</button></div>}</>;
}
