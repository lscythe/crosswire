"use client";

import { useState, type FormEvent } from "react";

export function ConnectionForm() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), baseUrl: form.get("baseUrl"), apiKey: form.get("apiKey"), visibility: form.get("visibility") }) });
    setMessage(response.ok ? "Connection created" : "Could not create connection");
    if (response.ok) event.currentTarget.reset();
  }
  return <form onSubmit={submit}>
    <label className="field">Name<input name="name" required /></label>
    <label className="field">Base URL<input name="baseUrl" type="url" placeholder="https://api.example.com/v1" required /></label>
    <label className="field">API key<input name="apiKey" type="password" required /></label>
    <label className="field">Visibility<select name="visibility" defaultValue="private"><option value="private">Private</option><option value="public">Public</option></select></label>
    <button className="primary">Add connection</button>{message && <p role="status">{message}</p>}
  </form>;
}
