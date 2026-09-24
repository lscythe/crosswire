"use client";
import { Button, Card, Chip, Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { ProbeCheck } from "../lib/probe";
import type { ProviderModel } from "../lib/provider-models";
import { ConnectionForm } from "./connection-form";
import type { KeyView } from "./provider-keys";

type ProbeResult = {
  requestedModel: string;
  returnedModel: string | null;
  identityConfidence: string;
  status: string;
  checks: ProbeCheck[];
};
export type ConnectionView = {
  id: string;
  name: string;
  base_url: string;
  visibility: "private" | "public";
  enabled: boolean;
  requests_per_minute: number;
  requests_per_day: number;
  quotaUsage: Array<{ user: string; used: number }>;
  last_test_status: string | null;
  canManage: boolean;
  latestProbe: ProbeResult | null;
};

export function ConnectionCard({
  connection,
  keys = [],
  selectedKeyId,
  catalog = [],
}: {
  connection: ConnectionView;
  keys?: KeyView[];
  selectedKeyId?: string | null;
  catalog?: ProviderModel[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const result = probe ?? connection.latestProbe;
  async function act(
    action: "toggle" | "test" | "probe",
    model?: string,
    keyId?: string,
    capabilities?: string[],
  ) {
    setPending(action);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/providers/${connection.id}${action === "probe" ? "/probe" : ""}`,
        {
          method: action === "toggle" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body:
            action === "toggle"
              ? JSON.stringify({ enabled: !connection.enabled })
              : action === "probe"
                ? JSON.stringify({ model, keyId, capabilities })
                : undefined,
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ??
            (action === "test"
              ? "Provider test failed. Check the URL and credentials."
              : "Request failed. Try again."),
        );
      if (action === "test") {
        setModels(body.models ?? []);
        setMessage(
          body.ok
            ? `Provider test passed. ${body.models.length} models returned.`
            : `Provider test failed (HTTP ${body.status}). Check the URL and credentials.`,
        );
      }
      if (action === "probe") setProbe(body);
      if (action === "toggle")
        setMessage(connection.enabled ? "Provider disabled" : "Provider enabled");
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
    const data = new FormData(event.currentTarget);
    void act(
      "probe",
      String(data.get("model")),
      String(data.get("keyId")),
      data.getAll("capabilities").map(String),
    );
  }
  return (
    <Card
      role="article"
      className="connection-card"
      aria-labelledby={`connection-${connection.id}`}
    >
      <h3 id={`connection-${connection.id}`}>{connection.name}</h3>
      <p className="connection-url">{connection.base_url}</p>
      <div className="connection-actions status-chips">
        <Chip size="sm" variant="soft" color="accent">
          {connection.visibility === "public" ? "Public" : "Private"}
        </Chip>
        <Chip size="sm" variant="soft" color={connection.enabled ? "success" : "default"}>
          {connection.enabled ? "Enabled" : "Disabled"}
        </Chip>
        <Chip
          size="sm"
          variant="soft"
          color={connection.last_test_status === "failed" ? "danger" : "default"}
        >
          Last test: {connection.last_test_status ?? "untested"}
        </Chip>
      </div>
      {connection.visibility === "public" && (
        <section aria-label="Public provider limits">
          <p>
            Per user: {connection.requests_per_minute} requests/minute ·{" "}
            {connection.requests_per_day} requests/day (UTC).
          </p>
          <p>
            Upstream attempts count even if they fail. Each probe check counts as one request.
            Discovery and health checks do not count.
          </p>
          <details>
            <summary>Daily quota usage</summary>
            {connection.quotaUsage.length ? (
              <ul>
                {connection.quotaUsage.map((item) => (
                  <li key={item.user}>
                    {item.user}: {item.used} / {connection.requests_per_day}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No quota used today.</p>
            )}
          </details>
        </section>
      )}
      {connection.canManage ? (
        <>
          <div className="connection-actions">
            <Button
              variant="secondary"
              type="button"
              isDisabled={!!pending}
              onPress={() => act("toggle")}
            >
              {pending === "toggle" ? "Saving..." : connection.enabled ? "Disable" : "Enable"}
            </Button>
            <Button
              variant="secondary"
              type="button"
              isDisabled={!!pending}
              onPress={() => act("test")}
            >
              {pending === "test" ? "Testing..." : "Test provider"}
            </Button>
          </div>
          <details>
            <summary>Edit provider</summary>
            <ConnectionForm
              connection={connection}
              onSaved={() => {
                setModels([]);
                setProbe(null);
              }}
            />
          </details>
        </>
      ) : (
        <p>Shared provider. Only its owner or an admin can edit or test it.</p>
      )}
      <form onSubmit={submitProbe}>
        <label className="field">
          Model
          <Input
            name="model"
            list={`models-${connection.id}`}
            placeholder="Enter a model ID"
            required
            maxLength={200}
            disabled={!connection.enabled || !!pending}
          />
        </label>
        <datalist id={`models-${connection.id}`}>
          {[
            ...new Set([
              ...models,
              ...catalog.filter((model) => model.enabled).map((model) => model.upstream_id),
            ]),
          ].map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        <label className="field">
          Probe using key
          <select
            name="keyId"
            defaultValue={selectedKeyId ?? ""}
            key={selectedKeyId}
            required
            disabled={!!pending}
          >
            <option value="" disabled>
              Choose a key
            </option>
            {keys
              .filter((key) => key.enabled)
              .map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name}
                </option>
              ))}
          </select>
        </label>
        <fieldset disabled={!!pending}>
          <legend>Capability checks</legend>
          <div className="connection-actions">
            {["chat", "streaming", "json", "tools"].map((capability) => (
              <label key={capability}>
                <input type="checkbox" name="capabilities" value={capability} defaultChecked />
                {capability}
              </label>
            ))}
          </div>
        </fieldset>
        <p>
          One short request per selected check. JSON and tools may be unsupported; results never
          overwrite model configuration.
        </p>
        <Button variant="secondary" type="submit" isDisabled={!connection.enabled || !!pending}>
          {pending === "probe" ? "Probing..." : "Run probe"}
        </Button>
        {!connection.enabled && <p>Enable this provider before probing.</p>}
      </form>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section aria-label="Latest probe" aria-live="polite">
          <h4>Latest probe: {result.status}</h4>
          <p>
            Requested: {result.requestedModel} · Returned: {result.returnedModel ?? "not reported"}
          </p>
          <p>Identity confidence: {result.identityConfidence}</p>
          <p>
            Provider-reported identity is evidence, not proof. This probe cannot cryptographically
            verify the model.
          </p>
          <details>
            <summary>Probe evidence</summary>
            {result.checks.map((check, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Probe evidence is an immutable result snapshot.
              <div key={`${check.capability}-${index}`}>
                <h5>
                  {check.capability}: {check.passed ? "passed" : "failed"}
                </h5>
                <pre>{JSON.stringify(check.evidence, null, 2)}</pre>
              </div>
            ))}
          </details>
        </section>
      )}
    </Card>
  );
}
