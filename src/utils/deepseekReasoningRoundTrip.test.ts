import { describe, expect, it } from "vitest";
import {
  addDeepSeekReasoningContentToCompletionsMessages,
  enableDeepSeekReasoningRoundTrip,
} from "./deepseekReasoningRoundTrip";

describe("DeepSeek reasoning_content round trip", () => {
  it("preserves empty reasoning_content on assistant completion messages", () => {
    const requestMessages = [
      { role: "user", content: "Call a tool" },
      { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_1", content: "done" },
      { role: "assistant", content: "Done" },
    ];
    const sourceMessages = [
      { type: "human", content: "Call a tool", additional_kwargs: {} },
      { type: "ai", content: "", additional_kwargs: { reasoning_content: "" } },
      { type: "tool", content: "done", additional_kwargs: {} },
      { type: "ai", content: "Done", additional_kwargs: { reasoning_content: "Need answer briefly." } },
    ];

    addDeepSeekReasoningContentToCompletionsMessages(requestMessages, sourceMessages);

    expect(requestMessages[1]).toMatchObject({ reasoning_content: "" });
    expect(requestMessages[3]).toMatchObject({ reasoning_content: "Need answer briefly." });
    expect(requestMessages[0]).not.toHaveProperty("reasoning_content");
    expect(requestMessages[2]).not.toHaveProperty("reasoning_content");
  });

  it("defaults missing assistant reasoning_content to an empty string", () => {
    const requestMessages = [
      { role: "user", content: "Continue" },
      { role: "assistant", content: "Previous answer" },
    ];

    addDeepSeekReasoningContentToCompletionsMessages(requestMessages);

    expect(requestMessages[1]).toMatchObject({ reasoning_content: "" });
  });

  it("patches ChatOpenAI completions requests before they reach DeepSeek", async () => {
    let capturedMessages: unknown;
    const model = {
      completions: {
        async _generate(messages: unknown[]) {
          void messages;
          return this.completionWithRetry({ messages: [{ role: "assistant", content: "" }] });
        },
        async completionWithRetry(request: { messages: unknown[] }) {
          capturedMessages = request.messages;
          return { ok: true };
        },
      },
    };

    enableDeepSeekReasoningRoundTrip(model);
    await model.completions._generate([
      { type: "ai", content: "", additional_kwargs: { reasoning_content: "" } },
    ]);

    expect(capturedMessages).toEqual([
      { role: "assistant", content: "", reasoning_content: "" },
    ]);
  });
});
