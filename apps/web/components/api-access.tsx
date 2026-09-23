"use client";
import { Button } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type KeyView = { id: string; name: string; key_prefix: string; last_used_at: string | null; revoked_at: string | null };
const shellQuote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

export function ApiAccess({ keys, models, baseUrl }: { keys: KeyView[]; models: string[]; baseUrl: string }) {
  const router = useRouter();
  const [secret, setSecret] = useState<{ id: string; key: string } | null>(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [exampleKind, setExampleKind] = useState<"curl" | "python" | "node">("curl");
  const [testKey, setTestKey] = useState("");
  const [testStatus, setTestStatus] = useState("");
  const [health, setHealth] = useState<Array<{ id: string; name: string; status: string; latencyMs: number; httpStatus: number }> | null>(null);
  const examples = {
    curl: `curl ${shellQuote(`${baseUrl}/chat/completions`)} \\
  -H "Authorization: Bearer $CROSSWIRE_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d ${shellQuote(JSON.stringify({ model: models[0] ?? "your-model-alias", messages: [{ role: "user", content: "Hello" }] }))}`,
    python: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url=${JSON.stringify(`${baseUrl}/`)}, api_key=os.environ["CROSSWIRE_API_KEY"])\nresponse = client.chat.completions.create(model=${JSON.stringify(models[0] ?? "your-model-alias")}, messages=[{"role": "user", "content": "Hello"}])\nprint(response.choices[0].message.content)`,
    node: `import OpenAI from "openai";\n\nconst client = new OpenAI({ baseURL: ${JSON.stringify(`${baseUrl}/`)}, apiKey: process.env.CROSSWIRE_API_KEY });\nconst response = await client.chat.completions.create({ model: ${JSON.stringify(models[0] ?? "your-model-alias")}, messages: [{ role: "user", content: "Hello" }] });\nconsole.log(response.choices[0].message.content);`,
  };
  const example = examples[exampleKind];
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

  async function testRequest() {
    setPending("test"); setTestStatus(""); setError("");
    try { const response = await fetch("/api/gateway-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: testKey || secret?.key }) }); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error ?? `Gateway returned HTTP ${body.status}`); setTestStatus(`Gateway reachable. ${body.modelCount} aliases · ${body.latencyMs}ms.`); }
    catch (cause) { setTestStatus(cause instanceof Error ? cause.message : "Gateway test failed"); }
    finally { setPending(""); router.refresh(); }
  }
  async function checkHealth() {
    setPending("health"); setError(""); setHealth(null);
    try { const response = await fetch("/api/provider-health"); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Health check failed"); setHealth(body.providers); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Health check failed"); }
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
      <label className="field">API base URL<input readOnly value={baseUrl} /></label><Button variant="secondary" type="submit" onPress={() => copy(baseUrl)}>Copy URL</Button>
      <p>Use a personal Crosswire key as your client’s API key. Provider credentials stay on the server.</p>
      <h3>Available aliases</h3>{models.length ? <ul>{models.map(model => <li key={model}>{model}</li>)}</ul> : <p>No models available. Set a default routing config with an enabled connection.</p>}
      <p>GET /v1/models returns your available aliases. Set CROSSWIRE_API_KEY in your terminal before running:</p>
      {exampleKind === "python" && <p>Install: <code>pip install openai</code></p>}{exampleKind === "node" && <p>Install: <code>npm install openai</code>. Save as <code>example.mjs</code>.</p>}<div className="connection-actions"><Button variant="secondary" type="button" aria-pressed={exampleKind === "curl"} onPress={() => setExampleKind("curl")}>curl</Button><Button variant="secondary" type="button" aria-pressed={exampleKind === "python"} onPress={() => setExampleKind("python")}>Python</Button><Button variant="secondary" type="button" aria-pressed={exampleKind === "node"} onPress={() => setExampleKind("node")}>Node</Button></div><pre>{example}</pre><Button variant="secondary" type="submit" onPress={() => copy(example)}>Copy example</Button>
    <label className="field">Test request with key<input type="password" value={testKey} onChange={event => setTestKey(event.target.value)} placeholder="Paste a Crosswire key" autoComplete="off" /></label><Button variant="secondary" type="submit" onPress={testRequest} isDisabled={!!pending}>{pending === "test" ? "Testing..." : "Test request"}</Button>{testStatus && <p role="status">{testStatus}</p>}<h3>Provider health</h3><Button variant="secondary" type="submit" onPress={checkHealth} isDisabled={!!pending}>{pending === "health" ? "Checking..." : "Check health"}</Button>{health?.length === 0 && <p>No enabled providers in your default config.</p>}{health && <ul>{health.map(provider => <li key={provider.id}>{provider.name} · {provider.status} · {provider.latencyMs}ms · HTTP {provider.httpStatus}</li>)}</ul>}</section>
    <section className="connection-card"><h2>Personal API keys</h2>
      <form onSubmit={create}><label className="field">Key name<input name="name" required maxLength={80} disabled={!!pending || !!secret} /></label><Button variant="primary" type="submit" className="primary" isDisabled={!!pending || !!secret}>{pending === "create" ? "Creating..." : "Create key"}</Button></form>
      {secret && <div><p>Save this key now. It will not be shown again.</p><label className="field">New API key<input readOnly autoComplete="off" value={secret.key} /></label><div className="connection-actions"><Button variant="secondary" type="submit" onPress={() => copy(secret.key)}>Copy key</Button><Button variant="secondary" type="submit" onPress={() => setSecret(null)}>Dismiss key</Button></div></div>}
      {!keys.length && <p>No API keys yet.</p>}
      <ul>{keys.map(key => <li key={key.id}><strong>{key.name}</strong> · {key.key_prefix}… · {key.revoked_at ? "Revoked" : "Active"} · Last used (updated at most once per minute): {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never"} {!key.revoked_at && <Button variant="secondary" type="submit" isDisabled={!!pending} onPress={() => revoke(key)} aria-label={`Revoke ${key.name}`}>Revoke</Button>}</li>)}</ul>
    </section>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
  </>;
}
