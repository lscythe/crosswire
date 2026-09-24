"use client";
import { Button, Card, Chip, Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
export type KeyView = {
  id: string;
  name: string;
  enabled: boolean;
  last_test_status: string | null;
};
export function ProviderKeys({
  providerId,
  keys,
  mode,
  selectedKeyId,
  canManage,
}: {
  providerId: string;
  keys: KeyView[];
  mode: string;
  selectedKeyId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function send(path: string, method: string, body?: object) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/providers/${providerId}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? result.message ?? "Could not update key");
      setMessage(result.message ?? "Saved");
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
      return false;
    } finally {
      setPending(false);
    }
  }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    if (await send("/keys", "POST", { name: data.get("name"), apiKey: data.get("apiKey") }))
      form.reset();
  }
  return (
    <Card className="connection-card">
      <h2>API keys</h2>
      <p>Secrets stay encrypted on the server. Enabled keys should share model access.</p>
      {canManage && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void send("", "PATCH", {
              keyMode: data.get("keyMode"),
              selectedKeyId: data.get("selectedKeyId"),
            });
          }}
        >
          <fieldset disabled={pending}>
            <label className="field">
              Key selection
              <select name="keyMode" defaultValue={mode} key={mode}>
                <option value="selected">Selected key</option>
                <option value="round_robin">Round-robin</option>
              </select>
            </label>
            <label className="field">
              Selected key
              <select
                name="selectedKeyId"
                defaultValue={selectedKeyId ?? ""}
                key={selectedKeyId}
                required
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
            <p>
              Round-robin rotates enabled keys per request. Manual tests and imports use your chosen
              key. Disabling the selected key stops selected-key forwarding until another is chosen.
            </p>
            <Button type="submit" variant="secondary">
              Save key selection
            </Button>
          </fieldset>
        </form>
      )}
      <ul className="member-list">
        {keys.map((key) => (
          <li key={key.id}>
            <div>
              <strong>{key.name}</strong>
              <p>
                {key.last_test_status ?? "Not tested"}
                {key.id === selectedKeyId ? " · Selected" : ""}
              </p>
            </div>
            <Chip size="sm" variant="soft">
              {key.enabled ? "Enabled" : "Disabled"}
            </Chip>
            {canManage && (
              <div className="connection-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={pending || !key.enabled}
                  onPress={() => send(`/keys/${key.id}`, "POST")}
                >
                  Test key
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={pending}
                  onPress={() => send(`/keys/${key.id}`, "PATCH", { enabled: !key.enabled })}
                >
                  {key.enabled ? "Disable key" : "Enable key"}
                </Button>
                <details>
                  <summary>Edit key</summary>
                  <form
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = event.currentTarget,
                        data = new FormData(form);
                      if (
                        await send(`/keys/${key.id}`, "PATCH", {
                          name: data.get("name"),
                          ...(data.get("apiKey") ? { apiKey: data.get("apiKey") } : {}),
                        })
                      )
                        (form.elements.namedItem("apiKey") as HTMLInputElement).value = "";
                    }}
                  >
                    <label className="field">
                      Key name
                      <Input name="name" required maxLength={100} defaultValue={key.name} />
                    </label>
                    <label className="field">
                      Replacement key
                      <Input
                        name="apiKey"
                        type="password"
                        maxLength={4096}
                        autoComplete="new-password"
                      />
                    </label>
                    <Button type="submit" variant="secondary" isDisabled={pending}>
                      Save key
                    </Button>
                  </form>
                </details>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <details>
          <summary>Add API key</summary>
          <form onSubmit={add}>
            <fieldset disabled={pending}>
              <label className="field">
                Key name
                <Input name="name" required maxLength={100} />
              </label>
              <label className="field">
                API key
                <Input
                  name="apiKey"
                  type="password"
                  required
                  maxLength={4096}
                  autoComplete="new-password"
                />
              </label>
              <Button type="submit" variant="primary">
                Add key
              </Button>
            </fieldset>
          </form>
        </details>
      )}
      <p role="status">{message}</p>
    </Card>
  );
}
