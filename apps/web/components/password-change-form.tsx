"use client";
import { Button, Input } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function PasswordChangeForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: form.get("password"), confirmPassword: form.get("confirmPassword") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not change password");
      router.replace("/login");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change password");
    } finally {
      setPending(false);
    }
  }
  return <form onSubmit={submit}>
    <label className="field">New password<Input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required /></label>
    <label className="field">Confirm password<Input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required /></label>
    {error && <p role="alert">{error}</p>}
    <Button variant="primary" type="submit" className="primary" isDisabled={pending}>{pending ? "Saving..." : "Change password"}</Button>
  </form>;
}
