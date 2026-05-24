import { describe, expect, it } from "vitest";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
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

  it("recovers reasoning_content from the previous streamed tool-call response when agent state dropped it", async () => {
    let capturedMessages: unknown;
    const model = {
      completions: {
        async *_streamResponseChunks() {
          yield {
            message: {
              content: "",
              additional_kwargs: { reasoning_content: "STREAMED_REASONING" },
              tool_call_chunks: [{ id: "call_1", name: "read_file", args: "{}", index: 0 }],
            },
          };
        },
        async _generate(messages: unknown[]) {
          void messages;
          return this.completionWithRetry({
            messages: [{
              role: "assistant",
              content: "",
              tool_calls: [{ id: "call_1", type: "function", function: { name: "read_file", arguments: "{}" } }],
            }],
          });
        },
        async completionWithRetry(request: { messages: unknown[] }) {
          capturedMessages = request.messages;
          return { ok: true };
        },
      },
    };

    enableDeepSeekReasoningRoundTrip(model);
    for await (const _chunk of model.completions._streamResponseChunks()) {
      // Drain the first model response so the adapter can cache its reasoning.
    }
    await model.completions._generate([
      { type: "ai", content: "", tool_calls: [{ id: "call_1", name: "read_file", args: {} }], additional_kwargs: {} },
    ]);

    expect(capturedMessages).toEqual([{
      role: "assistant",
      content: "",
      tool_calls: [{ id: "call_1", type: "function", function: { name: "read_file", arguments: "{}" } }],
      reasoning_content: "STREAMED_REASONING",
    }]);
  });

  it("patches the real ChatOpenAI streaming completions request with full reasoning_content", async () => {
    const model = enableDeepSeekReasoningRoundTrip(new ChatOpenAI({
      model: "deepseek-v4-pro",
      apiKey: "sk-test",
      streaming: true,
      configuration: { baseURL: "https://api.deepseek.com" },
    }) as any);
    let capturedMessages: unknown;
    model.completions.client = {
      chat: {
        completions: {
          create: async (request: { messages: unknown[] }) => {
            capturedMessages = request.messages;
            return (async function* emptyStream() {})();
          },
        },
      },
    };

    for await (const _chunk of model._streamResponseChunks([
      new AIMessage({
        content: "",
        tool_calls: [{ id: "call_1", name: "read_file", args: { path: "README.md" } }],
        additional_kwargs: { reasoning_content: "REAL_REASONING" },
      }),
      new ToolMessage({ content: "done", tool_call_id: "call_1" }),
    ], {})) {
      // Drain the request stream.
    }

    expect(capturedMessages).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: { name: "read_file", arguments: "{\"path\":\"README.md\"}" },
        }],
        reasoning_content: "REAL_REASONING",
      },
      { role: "tool", content: "done", tool_call_id: "call_1" },
    ]);
  });
});
