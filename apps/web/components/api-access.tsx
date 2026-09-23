"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type KeyView = { id: string; name: string; key_prefix: string; revoked_at: string | null };
const shellQuote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

export function ApiAccess({ keys, models, baseUrl }: { keys: KeyView[]; models: string[]; baseUrl: string }) {
  const router = useRouter();
  const [secret, setSecret] = useState<{ id: string; key: string } | null>(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const example = `curl ${shellQuote(`${baseUrl}/chat/completions`)} \\\n  -H "Authorization: Bearer $CROSSWIRE_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -d ${shellQuote(JSON.stringify({ model: models[0] ?? "your-model-alias", messages: [{ role: "user", content: "Hello" }] }))}`;
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("Copied"); setError(""); }
    catch { setError("Clipboard unavailable. Select and copy the text manually."); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get("name");
    setPending("create"); setError(""); setMessage("");
    try {
      const response = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create key");
      setSecret({ id: body.id, key: body.key }); form.reset(); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create key"); }
    finally { setPending(""); }
  }
  async function revoke(key: KeyView) {
    if (!window.confirm(`Revoke ${key.name}? Clients using this key will lose access immediately.`)) return;
    setPending(key.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/keys/${key.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not revoke key");
      if (secret?.id === key.id) setSecret(null);
      setMessage("Key revoked"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke key"); }
    finally { setPending(""); }
  }
  return <>
    <section className="connection-card"><h2>Connect your client</h2>
      <label className="field">API base URL<input readOnly value={baseUrl} /></label><button onClick={() => copy(baseUrl)}>Copy URL</button>
      <p>Use a personal Crosswire key as your client’s API key. Provider credentials stay on the server.</p>
      <h3>Available aliases</h3>{models.length ? <ul>{models.map(model => <li key={model}>{model}</li>)}</ul> : <p>No models available. Set a default routing config with an enabled connection.</p>}
      <p>GET /v1/models returns your available aliases. Set CROSSWIRE_API_KEY in your terminal before running:</p>
      <pre>{example}</pre><button onClick={() => copy(example)}>Copy request</button>
    </section>
    <section className="connection-card"><h2>Personal API keys</h2>
      <form onSubmit={create}><label className="field">Key name<input name="name" required maxLength={80} disabled={!!pending || !!secret} /></label><button className="primary" disabled={!!pending || !!secret}>{pending === "create" ? "Creating..." : "Create key"}</button></form>
      {secret && <div><p>Save this key now. It will not be shown again.</p><label className="field">New API key<input readOnly autoComplete="off" value={secret.key} /></label><div className="connection-actions"><button onClick={() => copy(secret.key)}>Copy key</button><button onClick={() => setSecret(null)}>Dismiss key</button></div></div>}
      {!keys.length && <p>No API keys yet.</p>}
      <ul>{keys.map(key => <li key={key.id}><strong>{key.name}</strong> · {key.key_prefix}… · {key.revoked_at ? "Revoked" : "Active"} {!key.revoked_at && <button disabled={!!pending} onClick={() => revoke(key)} aria-label={`Revoke ${key.name}`}>Revoke</button>}</li>)}</ul>
    </section>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
  </>;
}
