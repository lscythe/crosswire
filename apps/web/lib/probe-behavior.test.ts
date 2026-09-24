import { expect, test } from "vitest";
import { checkChat, checkJSON, checkStream, checkTools } from "./probe-behavior";

test("chat validates the requested answer, not just a string", () => {
  expect(checkChat({ choices: [{ message: { content: "OK" } }] })).toBe(true);
  expect(checkChat({ choices: [{ message: { content: "wrong" } }] })).toBe(false);
});
test("JSON and tools require the requested structured result", () => {
  expect(checkJSON({ choices: [{ message: { content: '{"ok":true}' } }] })).toBe(true);
  expect(checkJSON({ choices: [{ message: { content: '```json\n{"ok":true}\n```' } }] })).toBe(
    false,
  );
  expect(
    checkTools({
      choices: [
        {
          message: {
            tool_calls: [
              { type: "function", function: { name: "report_ok", arguments: '{"ok":true}' } },
            ],
          },
        },
      ],
    }),
  ).toBe(true);
  expect(checkTools({ choices: [{ message: { content: "OK" } }] })).toBe(false);
});
test("streaming requires actual content and completion, not an SSE header", () => {
  expect(checkStream("data: [DONE]\n\n")).toBe(false);
  expect(checkStream('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n')).toBe(
    true,
  );
  expect(checkStream('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n')).toBe(false);
  expect(checkStream("data: nope\n\ndata: [DONE]\n\n")).toBe(false);
});
