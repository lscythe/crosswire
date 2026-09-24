"use client";

import { IconArrowsMaximize, IconMinus, IconPlus, IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphProvider, GraphSnapshot, GraphStatus } from "../lib/route-graph";

const statusLabel: Record<GraphStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unreachable: "Unreachable",
  disabled: "Disabled",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function RouteGraph({ mode }: { mode: "preview" | "full" }) {
  const [scope, setScope] = useState<"default" | "all">("default");
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [stale, setStale] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/route-graph?scope=${scope}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Graph unavailable");
    setSnapshot((await response.json()) as GraphSnapshot);
    setStale(false);
  }, [scope]);

  useEffect(() => {
    load().catch(() => setStale(true));
    const timer = window.setInterval(() => load().catch(() => setStale(true)), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const events = new EventSource("/api/route-graph/events");
    events.onmessage = () => {
      setStale(false);
      load().catch(() => setStale(true));
    };
    events.addEventListener("stale", () => setStale(true));
    events.onerror = () => setStale(true);
    return () => events.close();
  }, [load]);

  const providers = snapshot?.providers ?? [];
  const height = Math.max(360, 190 + Math.ceil(providers.length / 2) * 92);
  const providerPoints = useMemo(
    () =>
      providers.map((provider, index) => ({
        provider,
        x: 720 + (index % 2) * 205,
        y: 100 + Math.floor(index / 2) * 92,
      })),
    [providers],
  );

  function resetView() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  return (
    <section className={`route-graph route-graph--${mode}`} aria-label="Live route graph">
      <div className="route-graph-toolbar">
        <div>
          <span className="eyebrow">Live topology</span>
          <strong>{providers.length} providers</strong>
          {stale && <span className="route-graph-stale">Updates paused</span>}
        </div>
        <div className="route-graph-actions">
          <label className="route-graph-scope">
            <span className="sr-only">Route scope</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as typeof scope)}
            >
              <option value="default">Default routes</option>
              <option value="all">All providers</option>
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            onClick={() => setScale((value) => Math.min(1.6, value + 0.1))}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <IconPlus size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setScale((value) => Math.max(0.6, value - 0.1))}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <IconMinus size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={resetView}
            aria-label="Fit to view"
            title="Fit to view"
          >
            <IconArrowsMaximize size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => load().catch(() => setStale(true))}
            aria-label="Refresh graph"
            title="Refresh graph"
          >
            <IconRefresh size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        className="route-graph-viewport"
        style={{ minHeight: mode === "preview" ? 370 : 540 }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setOffset({
            x: drag.current.ox + event.clientX - drag.current.x,
            y: drag.current.oy + event.clientY - drag.current.y,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className="route-graph-canvas"
          style={{ height, transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          <svg
            className="route-graph-edges"
            viewBox={`0 0 1100 ${height}`}
            aria-hidden="true"
            preserveAspectRatio="none"
          >
            <path
              className="route-edge route-edge--request"
              d="M 180 205 C 270 205, 300 205, 370 205"
            />
            <path
              className="route-edge route-edge--gateway"
              d="M 610 205 C 660 205, 670 145, 720 145"
            />
            {providerPoints.map(({ provider, x, y }) => (
              <path
                key={provider.id}
                className={`route-edge route-edge--${provider.status}`}
                d={`M 610 205 C 680 205, 650 ${y + 30}, ${x} ${y + 30}`}
              />
            ))}
          </svg>
          <div className="route-graph-node route-graph-node--request">Request</div>
          <div className="route-graph-node route-graph-node--gateway">
            <span className="route-graph-node-mark">CW</span>
            <strong>Crosswire</strong>
            <small>Gateway</small>
          </div>
          <div className="route-provider-group" style={{ height: Math.max(330, height - 30) }}>
            <div className="route-provider-group-label">Providers</div>
            {providerPoints.map(({ provider, x, y }) => (
              <ProviderNode
                key={provider.id}
                provider={provider}
                style={{ left: x - 20, top: y }}
              />
            ))}
            {!providers.length && <p className="route-graph-empty">No active providers</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProviderNode({
  provider,
  style,
}: {
  provider: GraphProvider;
  style: { left: number; top: number };
}) {
  return (
    <div
      className={`route-provider-node route-provider-node--${provider.status}`}
      style={style}
      role="img"
      aria-label={`${provider.name}: ${statusLabel[provider.status]}`}
    >
      <span className="route-provider-logo">
        {provider.logoKey ? provider.logoKey.slice(0, 2).toUpperCase() : initials(provider.name)}
      </span>
      <span className="route-provider-name">{provider.name}</span>
      <span className="route-provider-status">{statusLabel[provider.status]}</span>
    </div>
  );
}
