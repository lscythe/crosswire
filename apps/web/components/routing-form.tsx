"use client";

import { useState, type FormEvent } from "react";

export function RoutingForm({ connections }: { connections: Array<{ id: string; name: string }> }) {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/routing-configs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), isDefault: true, routes: [{ modelAlias: form.get("alias"), connectionId: form.get("connectionId"), upstreamModel: form.get("model"), priority: 0 }] }) });
    setMessage(response.ok ? "Routing config created" : "Could not create routing config");
    if (response.ok) event.currentTarget.reset();
  }
  return <form onSubmit={submit}><label className="field">Config name<input name="name" required defaultValue="default" /></label><label className="field">Model alias<input name="alias" required placeholder="gpt-4o" /></label><label className="field">Upstream model<input name="model" required placeholder="gpt-4o" /></label><label className="field">Connection<select name="connectionId" required>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></label><button className="primary">Save routing</button>{message && <p role="status">{message}</p>}</form>;
}
