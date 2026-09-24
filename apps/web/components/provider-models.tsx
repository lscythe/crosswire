"use client";
import { Button, Card, Chip, Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  capabilities,
  type ImportedModel,
  type ModelSettings,
  type ProviderModel,
} from "../lib/provider-models";
import type { KeyView } from "./provider-keys";

function ModelEditor({
  model,
  pending,
  save,
}: {
  model?: ProviderModel;
  pending: boolean;
  save: (body: object, modelId?: string) => Promise<boolean>;
}) {
  const overrides = model?.overrides ?? {};
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    const settings: ModelSettings = {};
    for (const field of ["contextWindow", "maxOutputTokens"] as const)
      if (data.get(field)) settings[field] = Number(data.get(field));
    for (const field of [...capabilities, "thinking"] as const) {
      const value = data.get(field);
      if (value === "inherit") continue;
      const support = value === "unknown" ? null : value === "yes";
      if (field === "thinking") settings.thinking = support;
      else {
        settings.capabilities ??= {};
        settings.capabilities[field] = support;
      }
    }
    const efforts = String(data.get("reasoningEfforts") ?? "").trim();
    if (efforts)
      settings.reasoningEfforts = efforts
        .split(",")
        .map((value) => value.trim()) as ModelSettings["reasoningEfforts"];
    if (
      await save(
        {
          ...(!model ? { upstreamId: data.get("upstreamId") } : {}),
          displayName: data.get("displayName"),
          enabled: data.get("enabled") === "on",
          overrides: settings,
        },
        model?.id,
      )
    ) {
      if (!model) form.reset();
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending}>
        {!model && (
          <label className="field">
            Upstream model ID
            <Input name="upstreamId" required maxLength={200} />
          </label>
        )}
        <label className="field">
          Display name
          <Input name="displayName" required maxLength={200} defaultValue={model?.display_name} />
        </label>
        <label>
          <input type="checkbox" name="enabled" defaultChecked={model?.enabled ?? true} />
          Enabled for routing
        </label>
        <div className="model-fields">
          <label className="field">
            Context window
            <Input
              type="number"
              name="contextWindow"
              min={1}
              max={100000000}
              defaultValue={overrides.contextWindow ?? ""}
              placeholder={String(model?.imported_metadata.contextWindow ?? "Unknown")}
            />
          </label>
          <label className="field">
            Maximum output tokens
            <Input
              type="number"
              name="maxOutputTokens"
              min={1}
              max={100000000}
              defaultValue={overrides.maxOutputTokens ?? ""}
              placeholder={String(model?.imported_metadata.maxOutputTokens ?? "Unknown")}
            />
          </label>
          {[...capabilities, "thinking"].map((field) => {
            const value =
              field === "thinking" ? overrides.thinking : overrides.capabilities?.[field];
            return (
              <label className="field" key={field}>
                {field === "thinking" ? "Thinking / reasoning" : field}
                <select
                  name={field}
                  defaultValue={
                    value === undefined
                      ? "inherit"
                      : value === null
                        ? "unknown"
                        : value
                          ? "yes"
                          : "no"
                  }
                >
                  <option value="inherit">Use provider metadata</option>
                  <option value="unknown">Unknown</option>
                  <option value="yes">Supported</option>
                  <option value="no">Unsupported</option>
                </select>
              </label>
            );
          })}
        </div>
        <label className="field">
          Reasoning efforts
          <Input
            name="reasoningEfforts"
            defaultValue={overrides.reasoningEfforts?.join(", ") ?? ""}
            placeholder="low, medium, high"
          />
        </label>
        <p>
          Allowed: none, minimal, low, medium, high, xhigh. Blank fields use imported metadata or
          remain unknown. These settings describe capabilities; they do not rewrite requests or
          prove support.
        </p>
        <Button type="submit" variant="secondary">
          {model ? "Save model" : "Add model"}
        </Button>
      </fieldset>
    </form>
  );
}
export function ProviderModels({
  providerId,
  models,
  keys,
  selectedKeyId,
  canManage,
}: {
  providerId: string;
  models: ProviderModel[];
  keys: KeyView[];
  selectedKeyId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [keyId, setKeyId] = useState(selectedKeyId ?? ""),
    [preview, setPreview] = useState<ImportedModel[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState("");
  async function request(path: string, body: object, method = "POST") {
    const response = await fetch(`/api/providers/${providerId}/models${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not update models");
    return result;
  }
  async function discover(importSelected = false) {
    setPending(true);
    setMessage("");
    try {
      const result = await request("/import", {
        keyId,
        ...(importSelected ? { modelIds: selected } : {}),
      });
      if (importSelected) {
        setMessage(`Imported ${result.imported} models. Manual settings preserved.`);
        setPreview([]);
        router.refresh();
      } else {
        setPreview(result.models);
        setSelected(result.models.map((model: ImportedModel) => model.id));
        setMessage(`${result.models.length} models available to import`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      setPending(false);
    }
  }
  async function save(body: object, modelId?: string) {
    setPending(true);
    setMessage("");
    try {
      await request(modelId ? `/${modelId}` : "", body, modelId ? "PATCH" : "POST");
      setMessage("Model saved");
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
      return false;
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="connection-card">
      <h2>Models</h2>
      <p>
        Imported claims, your configuration, and probe evidence stay separate. Unknown means the
        provider supplied no metadata.
      </p>
      {canManage && (
        <>
          <div className="connection-actions">
            <label className="field">
              Import using key
              <select
                value={keyId}
                disabled={pending}
                onChange={(event) => {
                  setKeyId(event.target.value);
                  setPreview([]);
                  setSelected([]);
                }}
              >
                <option value="">Choose a key</option>
                {keys
                  .filter((key) => key.enabled)
                  .map((key) => (
                    <option key={key.id} value={key.id}>
                      {key.name}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              variant="secondary"
              isDisabled={pending || !keys.some((key) => key.id === keyId && key.enabled)}
              onPress={() => discover()}
            >
              Preview import
            </Button>
          </div>
          {!!preview.length && (
            <div className="import-preview">
              <h3>Select models to import</h3>
              <label>
                <input
                  type="checkbox"
                  checked={selected.length === preview.length}
                  onChange={(event) =>
                    setSelected(event.target.checked ? preview.map((model) => model.id) : [])
                  }
                />
                Select all
              </label>
              <div className="model-import-list">
                {preview.map((model) => (
                  <label key={model.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(model.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, model.id]
                            : current.filter((id) => id !== model.id),
                        )
                      }
                    />
                    {model.id}
                  </label>
                ))}
              </div>
              <Button
                variant="primary"
                isDisabled={pending || !selected.length}
                onPress={() => discover(true)}
              >
                Import selected ({selected.length})
              </Button>
            </div>
          )}
          <details>
            <summary>Add model manually</summary>
            <ModelEditor pending={pending} save={save} />
          </details>
        </>
      )}
      <p role="status">{message}</p>
      <label className="field">
        Search models
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Model name or ID"
        />
      </label>
      <div className="model-catalog">
        {models
          .filter((model) =>
            `${model.upstream_id} ${model.display_name}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((model) => {
            const effective = {
              ...model.imported_metadata,
              ...model.overrides,
              capabilities: {
                ...model.imported_metadata.capabilities,
                ...model.overrides.capabilities,
              },
            };
            return (
              <article className="model-entry" key={model.id}>
                <div className="panel-heading">
                  <div>
                    <h3>{model.display_name}</h3>
                    <code>{model.upstream_id}</code>
                  </div>
                  <Chip size="sm" variant="soft" color={model.enabled ? "success" : "default"}>
                    {model.enabled ? "Enabled" : "Disabled"}
                  </Chip>
                </div>
                <p>
                  Context: {effective.contextWindow?.toLocaleString() ?? "Unknown"} · Output:{" "}
                  {effective.maxOutputTokens?.toLocaleString() ?? "Unknown"} · Thinking:{" "}
                  {effective.thinking == null
                    ? "Unknown"
                    : effective.thinking
                      ? "Supported"
                      : "Unsupported"}
                </p>
                <div className="connection-actions">
                  {capabilities.map((capability) => (
                    <Chip key={capability} size="sm" variant="soft">
                      {capability}:{" "}
                      {effective.capabilities[capability] == null
                        ? "unknown"
                        : effective.capabilities[capability]
                          ? "yes"
                          : "no"}
                    </Chip>
                  ))}
                </div>
                <p>Reasoning efforts: {effective.reasoningEfforts?.join(", ") || "Unknown"}</p>
                <p>
                  {model.imported_at
                    ? `Imported ${new Date(model.imported_at).toLocaleString()} using ${keys.find((key) => key.id === model.discovered_by_key_id)?.name ?? "removed key"}`
                    : "Added manually"}
                </p>
                <details>
                  <summary>Provider-reported metadata</summary>
                  <pre>{JSON.stringify(model.imported_metadata, null, 2)}</pre>
                </details>
                {canManage && (
                  <details>
                    <summary>Configure model</summary>
                    <ModelEditor
                      key={JSON.stringify(model)}
                      model={model}
                      pending={pending}
                      save={save}
                    />
                  </details>
                )}
              </article>
            );
          })}
      </div>
      {!models.length && <p>No models imported yet.</p>}
    </Card>
  );
}
