"use client";
import { Button, Card, Chip } from "@heroui/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RoutingForm } from "./routing-form";
import type { RoutingConfig } from "../lib/routing";

export function RoutingCard({ config, connections }: { config: RoutingConfig; connections: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function act(remove: boolean) {
    if (remove && !window.confirm(`Delete ${config.name}?${config.is_default ? " Routing will be inactive until another default is selected." : ""}`)) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/routing-configs/${config.id}`, { method: remove ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, ...(remove ? {} : { body: JSON.stringify({ isDefault: true }) }) });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not update config");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update config"); }
    finally { setPending(false); }
  }
  return <Card role="article" className="connection-card" aria-label={config.name}><h2>{config.name}</h2><Chip size="sm" variant="soft" color={config.is_default ? "success" : "default"}>{config.is_default ? "Default config" : "Inactive config"}</Chip>
    <ol>{config.routes.map((route, index) => <li key={index}>{route.modelAlias} · {connections.find((connection) => connection.id === route.connectionId)?.name ?? "Unavailable connection"} · {route.upstreamModel}</li>)}</ol>
    <div className="connection-actions"><Button variant="secondary" type="button" isDisabled={pending || config.is_default} onPress={() => act(false)}>Make default</Button><Button variant="secondary" type="button" isDisabled={pending} onPress={() => act(true)}>Delete config</Button></div>
    {error && <p role="alert">{error}</p>}
    <details><summary>Edit config</summary><RoutingForm key={JSON.stringify(config)} config={config} connections={connections} /></details>
  </Card>;
}
