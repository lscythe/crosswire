"use client";
import { Button } from "@heroui/react";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { RoutingConfig, RoutingInput } from "../lib/routing";

export function RoutingForm({ connections, config }: { connections: Array<{ id: string; name: string }>; config?: RoutingConfig }) {
  const router = useRouter();
  const blank = () => ({ modelAlias: "", connectionId: connections[0]?.id ?? "", upstreamModel: "", priority: 0 });
  const [routes, setRoutes] = useState<RoutingInput["routes"]>(config?.routes.length ? config.routes : [blank()]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  function update(index: number, field: "modelAlias" | "connectionId" | "upstreamModel", value: string) {
    setRoutes((current) => current.map((route, i) => i === index ? { ...route, [field]: value } : route));
  }
  function move(index: number, direction: number) {
    setRoutes((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/routing-configs${config ? `/${config.id}` : ""}`, { method: config ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), isDefault: form.get("isDefault") === "on", routes: routes.map((route, priority) => ({ ...route, priority })) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save routing config");
      if (!config) { element.reset(); setRoutes([blank()]); }
      setMessage("Routing config saved");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save routing config");
    } finally { setPending(false); }
  }
  return <form onSubmit={submit}><fieldset className="connection-fields" disabled={pending}>
    <label className="field">Config name<input name="name" required maxLength={100} defaultValue={config?.name} /></label>
    <label><input type="checkbox" name="isDefault" defaultChecked={config?.is_default ?? false} /> Use as default</label>
    <p>Routes with the same alias are tried from top to bottom. Fallback occurs on transport errors or HTTP 5xx; other responses are returned directly.</p>
    {routes.map((route, index) => <fieldset className="route-row" key={index}><legend>Route {index + 1}</legend>
      <label className="field">Model alias<input required maxLength={100} value={route.modelAlias} onChange={(event) => update(index, "modelAlias", event.target.value)} placeholder="team-chat" /></label>
      <label className="field">Connection<select required value={route.connectionId} onChange={(event) => update(index, "connectionId", event.target.value)}>
        {!connections.some((connection) => connection.id === route.connectionId) && <option value={route.connectionId} disabled>Unavailable connection — select another</option>}
        {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
      </select></label>
      <label className="field">Upstream model<input required maxLength={200} value={route.upstreamModel} onChange={(event) => update(index, "upstreamModel", event.target.value)} /></label>
      <div className="connection-actions"><Button variant="secondary" type="button" isDisabled={index === 0} onPress={() => move(index, -1)}>Move up</Button><Button variant="secondary" type="button" isDisabled={index === routes.length - 1} onPress={() => move(index, 1)}>Move down</Button><Button variant="secondary" type="button" isDisabled={routes.length === 1} onPress={() => setRoutes((current) => current.filter((_, i) => i !== index))}>Remove route</Button></div>
    </fieldset>)}
    <div className="connection-actions"><Button variant="secondary" type="button" isDisabled={routes.length >= 100 || !connections.length} onPress={() => setRoutes((current) => [...current, blank()])}>Add route</Button><Button variant="primary" type="submit" className="primary" isDisabled={!connections.length}>{pending ? "Saving..." : "Save routing"}</Button></div>
    {!connections.length && <p>Add or enable a connection before saving routes.</p>}
  </fieldset>{message && <p role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}</form>;
}
