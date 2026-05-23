import { describe, expect, it } from "vitest";
import { extractModelOutputParts, stripExposedThinking } from "./modelReasoning";

describe("model reasoning extraction", () => {
  it("separates provider reasoning_content from visible content", () => {
    expect(extractModelOutputParts({
      content: "你好！",
      additional_kwargs: {
        reasoning_content: "The user is saying hello. I should answer briefly.",
      },
    })).toEqual({
      content: "你好！",
      reasoning: "The user is saying hello. I should answer briefly.",
    });
  });

  it("extracts thinking content blocks without mixing them into the answer", () => {
    expect(extractModelOutputParts({
      content: [
        { type: "thinking", thinking: "Need answer in Chinese." },
        { type: "text", text: "你好！" },
      ],
    })).toEqual({
      content: "你好！",
      reasoning: "Need answer in Chinese.",
    });
  });

  it("extracts OpenAI Responses reasoning summaries", () => {
    expect(extractModelOutputParts({
      content: [
        { type: "reasoning", reasoning: "Need answer in Chinese." },
        { type: "text", text: "你好！" },
      ],
      additional_kwargs: {
        reasoning: {
          type: "reasoning",
          summary: [
            { type: "summary_text", text: "Need answer in Chinese." },
          ],
        },
      },
    })).toEqual({
      content: "你好！",
      reasoning: "Need answer in Chinese.",
    });
  });

  it("extracts LangChain contentBlocks reasoning and raw provider deltas", () => {
    expect(extractModelOutputParts({
      content: "你好！",
      contentBlocks: [
        { type: "reasoning", reasoning: "Use a short greeting." },
        { type: "text", text: "你好！" },
      ],
      additional_kwargs: {
        raw_response: {
          choices: [
            { delta: { reasoning_content: "Raw provider thought." } },
          ],
        },
      },
    })).toEqual({
      content: "你好！",
      reasoning: "Use a short greeting.Raw provider thought.",
    });
  });

  it("strips complete think tags from visible content", () => {
    expect(stripExposedThinking("<think>plan quietly</think>最终回答")).toEqual({
      content: "最终回答",
      reasoning: "plan quietly",
    });
  });
});
