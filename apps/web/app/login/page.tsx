"use client";
import { Button } from "@heroui/react";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!response.ok) throw new Error("Invalid email or password");
      const user = await response.json();
      router.replace(user.mustChangePassword ? "/change-password" : "/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return <main className="auth">
    <div className="auth-brand">Crosswire / Team gateway</div><h1>Welcome back</h1><p>Sign in to your workspace.</p>
    <form onSubmit={submit}>
      <label className="field">Email<input name="email" type="email" autoComplete="username" required /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <Button variant="primary" type="submit" className="primary" isDisabled={pending}>{pending ? "Signing in..." : "Sign in"}</Button>
    </form>
  </main>;
}
