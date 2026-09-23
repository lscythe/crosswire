"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ConnectionForm } from "./connection-form";
import type { ProbeCheck } from "../lib/probe";

type ProbeResult = { requestedModel: string; returnedModel: string | null; identityConfidence: string; status: string; checks: ProbeCheck[] };
export type ConnectionView = { id: string; name: string; base_url: string; visibility: "private" | "public"; enabled: boolean; last_test_status: string | null; canManage: boolean; latestProbe: ProbeResult | null };

export function ConnectionCard({ connection }: { connection: ConnectionView }) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const result = probe ?? connection.latestProbe;
  async function act(action: "toggle" | "test" | "probe", model?: string) {
    setPending(action);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/connections/${connection.id}${action === "probe" ? "/probe" : ""}`, {
        method: action === "toggle" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "toggle" ? JSON.stringify({ enabled: !connection.enabled }) : action === "probe" ? JSON.stringify({ model }) : undefined,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? (action === "test" ? "Connection test failed. Check the URL and credentials." : "Request failed. Try again."));
      if (action === "test") {
        setModels(body.models ?? []);
        setMessage(body.ok ? `Connection test passed. ${body.models.length} models returned.` : `Connection test failed (HTTP ${body.status}). Check the URL and credentials.`);
      }
      if (action === "probe") setProbe(body);
      if (action === "toggle") setMessage(connection.enabled ? "Connection disabled" : "Connection enabled");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed. Try again.");
      router.refresh();
    } finally {
      setPending("");
    }
  }
  function submitProbe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void act("probe", String(new FormData(event.currentTarget).get("model")));
  }
  return <article className="connection-card" aria-labelledby={`connection-${connection.id}`}>
    <h3 id={`connection-${connection.id}`}>{connection.name}</h3>
    <p className="connection-url">{connection.base_url}</p>
    <p>{connection.visibility === "public" ? "Public" : "Private"} · {connection.enabled ? "Enabled" : "Disabled"} · Last test: {connection.last_test_status ?? "untested"}</p>
    {connection.canManage ? <>
      <div className="connection-actions">
        <button type="button" disabled={!!pending} onClick={() => act("toggle")}>{pending === "toggle" ? "Saving..." : connection.enabled ? "Disable" : "Enable"}</button>
        <button type="button" disabled={!!pending} onClick={() => act("test")}>{pending === "test" ? "Testing..." : "Test connection"}</button>
      </div>
      <details><summary>Edit connection</summary><ConnectionForm connection={connection} onSaved={() => { setModels([]); setProbe(null); }} /></details>
    </> : <p>Shared connection. Only its owner or an admin can edit or test it.</p>}
    <form onSubmit={submitProbe}>
      <label className="field">Model<input name="model" list={`models-${connection.id}`} placeholder="Enter a model ID" required maxLength={200} disabled={!connection.enabled || !!pending} /></label>
      <datalist id={`models-${connection.id}`}>{models.map((model) => <option key={model} value={model} />)}</datalist>
      <p>Choose a suggested model after testing, or enter an ID. A probe sends two short requests to the provider.</p>
      <button type="submit" disabled={!connection.enabled || !!pending}>{pending === "probe" ? "Probing..." : "Run probe"}</button>
      {!connection.enabled && <p>Enable this connection before probing.</p>}
    </form>
    {message && <p role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {result && <section aria-label="Latest probe" aria-live="polite">
      <h4>Latest probe: {result.status}</h4>
      <p>Requested: {result.requestedModel} · Returned: {result.returnedModel ?? "not reported"}</p>
      <p>Identity confidence: {result.identityConfidence}</p>
      <p>Provider-reported identity is evidence, not proof. This probe cannot cryptographically verify the model.</p>
      <details><summary>Probe evidence</summary>{result.checks.map((check, index) => <div key={`${check.capability}-${index}`}><h5>{check.capability}: {check.passed ? "passed" : "failed"}</h5><pre>{JSON.stringify(check.evidence, null, 2)}</pre></div>)}</details>
    </section>}
  </article>;
}
