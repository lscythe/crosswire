"use client";
import { Button, Input } from "@heroui/react";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type EditableConnection = { id: string; name: string; base_url: string; visibility: "private" | "public"; requests_per_minute: number; requests_per_day: number };

export function ConnectionForm({ connection, onSaved }: { connection?: EditableConnection; onSaved?: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const apiKey = form.get("apiKey");
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(connection ? `/api/connections/${connection.id}` : "/api/connections", { method: connection ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), baseUrl: form.get("baseUrl"), ...(apiKey ? { apiKey } : {}), visibility: form.get("visibility"), requestsPerMinute: Number(form.get("requestsPerMinute")), requestsPerDay: Number(form.get("requestsPerDay")) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save connection");
      if (!connection) element.reset();
      else (element.elements.namedItem("apiKey") as HTMLInputElement).value = "";
      setMessage(connection ? "Changes saved" : "Connection created");
      onSaved?.();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save connection");
    } finally {
      setPending(false);
    }
  }
  return <form onSubmit={submit}>
    <fieldset disabled={pending} className="connection-fields">
      <label className="field">Name<Input name="name" required maxLength={100} defaultValue={connection?.name} /></label>
      <label className="field">Base URL<Input name="baseUrl" type="url" placeholder="https://api.example.com/v1" required defaultValue={connection?.base_url} /></label>
      <label className="field">{connection ? "Replacement API key (optional)" : "API key"}<Input name="apiKey" type="password" autoComplete="new-password" required={!connection} maxLength={4096} /></label>
      {connection && <p>Leave the key blank to keep the saved secret.</p>}
      <label className="field">Visibility<select name="visibility" defaultValue={connection?.visibility ?? "private"}><option value="private">Private</option><option value="public">Public</option></select></label>
      <p>Public connections: limits apply per user, across all their API keys. Daily quota resets at midnight UTC. Private connections are unlimited.</p>
      <label className="field">Requests per minute per user<Input name="requestsPerMinute" type="number" required min={1} max={10000} defaultValue={connection?.requests_per_minute ?? 60} /></label>
      <label className="field">Requests per day per user<Input name="requestsPerDay" type="number" required min={1} max={1000000} defaultValue={connection?.requests_per_day ?? 1000} /></label>
      <Button variant="primary" type="submit" className="primary">{pending ? "Saving..." : connection ? "Save changes" : "Add connection"}</Button>
    </fieldset>
    {message && <p role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
  </form>;
}
