import { describe, expect, it } from "vitest";
import { getCandidates, registerBuiltinCommands, registry } from "./slash-commands";
import type { SkillSummary } from "../types";

function skill(name: string): SkillSummary {
  return {
    id: `test:${name}`,
    name,
    description: `Use ${name}`,
    path: `/tmp/${name}/SKILL.md`,
    scope: "user",
    enabled: true,
  };
}

describe("slash commands", () => {
  it("suggests available skills for a bare slash", () => {
    registerBuiltinCommands(() => [skill("ui-ux-pro-max"), skill("save-chat")]);

    const candidates = getCandidates("/");

    expect(candidates.map((candidate) => candidate.command.id)).toEqual([
      "skill.run.ui-ux-pro-max",
      "skill.run.save-chat",
    ]);
  });

  it("filters skills by slash prefix", () => {
    registerBuiltinCommands(() => [skill("ui-ux-pro-max"), skill("save-chat")]);

    const candidates = getCandidates("/ui");

    expect(candidates.map((candidate) => candidate.command.id)).toEqual(["skill.run.ui-ux-pro-max"]);
  });

  it("hides candidates after a skill has been completed with a trailing space", () => {
    registerBuiltinCommands(() => [skill("ui-ux-pro-max")]);

    expect(getCandidates("/ui-ux-pro-max ")).toEqual([]);
  });

  it("resolves a selected skill while preserving trailing user instructions", () => {
    registerBuiltinCommands(() => [skill("ui-ux-pro-max")]);

    const command = registry.resolve("ui-ux-pro-max", "帮我优化 Trace");

    expect(command?.id).toBe("skill.run.ui-ux-pro-max");
  });

  it("replaces stale skill candidates when skills are reloaded", () => {
    registerBuiltinCommands(() => [skill("old-skill")]);
    registerBuiltinCommands(() => [skill("new-skill")]);

    expect(getCandidates("/").map((candidate) => candidate.command.id)).toEqual(["skill.run.new-skill"]);
  });
});
