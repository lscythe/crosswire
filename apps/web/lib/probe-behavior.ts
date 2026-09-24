import type { ProbeCheck } from "./probe";
import { readBounded } from "./providers";

export const probeCapabilities = ["chat", "streaming", "json", "tools"] as const;
export type ProbeCapability = (typeof probeCapabilities)[number];
type Chat = {
  model?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
      tool_calls?: Array<{ type?: string; function?: { name?: string; arguments?: string } }>;
    };
  }>;
};
export function checkChat(body: Chat) {
  return body.choices?.[0]?.message?.content === "OK";
}
export function checkJSON(body: Chat) {
  try {
    return JSON.parse(String(body.choices?.[0]?.message?.content)).ok === true;
  } catch {
    return false;
  }
}
export function checkTools(body: Chat) {
  const calls = body.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls)) return false;
  return calls.some((call) => {
    try {
      return (
        call.type === "function" &&
        call.function?.name === "report_ok" &&
        JSON.parse(call.function.arguments ?? "").ok === true
      );
    } catch {
      return false;
    }
  });
}
export function checkStream(text: string) {
  let content = "",
    done = false;
  try {
    for (const event of text.replace(/\r\n/g, "\n").split("\n\n")) {
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      if (done) return false;
      if (data === "[DONE]") {
        done = true;
        continue;
      }
      const chunk = JSON.parse(data);
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === "string") content += delta;
    }
    return done && content === "OK";
  } catch {
    return false;
  }
}
export async function runBehaviorProbe(
  baseUrl: string,
  apiKey: string,
  model: string,
  capability: ProbeCapability,
): Promise<{ check: ProbeCheck; returnedModel: string | null }> {
  const started = Date.now();
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: "Reply with exactly OK." }],
    max_tokens: 128,
  };
  if (capability === "streaming") body.stream = true;
  if (capability === "json") {
    body.messages = [{ role: "user", content: 'Return only a JSON object with "ok": true.' }];
    body.response_format = { type: "json_object" };
  }
  if (capability === "tools") {
    body.messages = [{ role: "user", content: "Call report_ok with ok set to true." }];
    body.tools = [
      {
        type: "function",
        function: {
          name: "report_ok",
          description: "Report success",
          parameters: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
            additionalProperties: false,
          },
        },
      },
    ];
    body.tool_choice = { type: "function", function: { name: "report_ok" } };
  }
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const evidence: Record<string, unknown> = { httpStatus: response.status };
    let passed = false,
      returnedModel: string | null = null;
    if (response.ok) {
      const text = await readBounded(response, 65536);
      if (capability === "streaming")
        passed =
          (response.headers.get("content-type") ?? "").includes("text/event-stream") &&
          checkStream(text);
      else {
        const json = JSON.parse(text) as Chat;
        if (json && typeof json === "object") {
          // Only retain the requested ID; arbitrary upstream text can contain credentials.
          returnedModel = json.model === model ? model : null;
          evidence.modelClaim =
            json.model === model
              ? "matches"
              : typeof json.model === "string"
                ? "differs"
                : "missing";
          passed =
            capability === "chat"
              ? checkChat(json)
              : capability === "json"
                ? checkJSON(json)
                : checkTools(json);
        }
      }
    } else await response.body?.cancel();
    evidence.latencyMs = Date.now() - started;
    evidence.validation = passed ? "Expected behavior observed" : "Expected behavior not observed";
    return { check: { capability, passed, evidence }, returnedModel };
  } catch {
    return {
      check: {
        capability,
        passed: false,
        evidence: {
          error: "Provider response unavailable, invalid, or timed out",
          latencyMs: Date.now() - started,
        },
      },
      returnedModel: null,
    };
  }
}
