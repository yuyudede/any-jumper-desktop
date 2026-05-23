/**
 * 斜杠命令系统 — 解析、注册、路由
 *
 * 用户在输入框输入 `/` 开头的内容时触发命令提示，
 * 选择命令后自动填充输入框或直接执行特定 UI 动作。
 */

import type { SkillSummary } from "../types";

/* ==================== 类型定义 ==================== */

export interface SlashCommand {
  /** 唯一标识，如 `skill.list` */
  id: string;
  /** 用户输入的触发词，如 `skill` */
  trigger: string;
  /** 命令名称（显示用） */
  label: string;
  /** 简短描述 */
  description: string;
  /** 分类分组 */
  group: "builtin" | "skill" | "plugin";
  /** 用法说明 */
  usage?: string;
  /**
   * 执行方式：
   * - "fill"：将输入框内容替换为指定文本（如 `/skill list` → 变成对 agent 的自然语言指令）
   * - "direct"：直接执行 UI 动作（如清空会话、打开设置等）
   */
  action: "fill" | "direct";
  /** 填充到输入框的文本（action 为 "fill" 时使用） */
  fillText?: string;
  /** 直接执行的函数（action 为 "direct" 时使用） */
  handler?: () => void;
}

/* ==================== 注册表 ==================== */

class SlashCommandRegistry {
  private commands: Map<string, SlashCommand> = new Map();

  clear(): void {
    this.commands.clear();
  }

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.id, cmd);
  }

  /** 根据触发词查找所有匹配的命令 */
  findCandidates(trigger: string, args: string): SlashCommand[] {
    const results: SlashCommand[] = [];
    for (const cmd of this.commands.values()) {
      if (cmd.trigger === trigger) {
        // 对于 fill 类型的命令，需要匹配 fillText 前缀
        if (cmd.action === "fill") {
          const fillArg = cmd.fillText || "";
          if (!args || fillArg.startsWith(args)) {
            results.push(cmd);
          }
        } else {
          results.push(cmd);
        }
      }
    }
    return results;
  }

  /** 获取所有已注册的命令（含子命令） */
  getAllCommands(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /** 获取所有可用于提示列表的顶级命令 */
  getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /** 根据命令全路径查找（如 `/skill list` 的 trigger="skill", args="list"） */
  resolve(trigger: string, args: string): SlashCommand | undefined {
    const normalizedArgs = args.trim();
    // 优先精确匹配
    let bestFillMatch: SlashCommand | undefined;
    for (const cmd of this.commands.values()) {
      if (cmd.trigger === trigger && cmd.action === "direct") return cmd;
      if (cmd.trigger !== trigger || !cmd.fillText) continue;
      if (cmd.fillText === normalizedArgs) return cmd;
      if (normalizedArgs.startsWith(`${cmd.fillText} `)) {
        if (!bestFillMatch || cmd.fillText.length > (bestFillMatch.fillText?.length || 0)) {
          bestFillMatch = cmd;
        }
      }
    }
    if (bestFillMatch) return bestFillMatch;
    // 回退：找第一个匹配 trigger 的
    for (const cmd of this.commands.values()) {
      if (cmd.trigger === trigger) return cmd;
    }
    return undefined;
  }
}

export const registry = new SlashCommandRegistry();

/* ==================== 解析器 ==================== */

export interface ParsedCommand {
  /** 是否匹配到斜杠命令 */
  matched: boolean;
  /** 触发词（如 "skill"） */
  trigger: string;
  /** 参数部分（如 "list"） */
  args: string;
  /** 完整输入（用于补全） */
  fullInput: string;
}

/**
 * 解析输入框文本，判断是否是斜杠命令
 */
export function parseSlashInput(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const withoutSlash = trimmed.slice(1);
  // 分离 trigger 和 args
  const spaceIndex = withoutSlash.indexOf(" ");
  let trigger: string;
  let args: string;

  if (spaceIndex === -1) {
    trigger = withoutSlash;
    args = "";
  } else {
    trigger = withoutSlash.slice(0, spaceIndex);
    args = withoutSlash.slice(spaceIndex + 1).trim();
  }

  // 忽略纯 "/" 的情况
  if (!trigger) return null;

  return {
    matched: true,
    trigger,
    args,
    fullInput: trimmed,
  };
}

/**
 * 判断输入是否为斜杠命令输入状态（以 `/` 开头，用于显示提示浮层）
 */
export function isSlashActive(input: string): boolean {
  return input.trim().startsWith("/");
}

/* ==================== 内建命令注册 ==================== */

export function registerBuiltinCommands(getSkills: () => SkillSummary[]): void {
  registry.clear();

  const skills = getSkills();
  for (const skill of skills) {
    const skillName = skill.name;
    registry.register({
      id: `skill.run.${skillName}`,
      trigger: skillName,
      label: skillName,
      description: skill.description || `触发 ${skillName} 技能`,
      group: "skill",
      action: "direct",
      usage: `/${skillName}`,
    });
  }
}

/* ==================== 候选列表构建 ==================== */

export interface SlashCandidate {
  command: SlashCommand;
  /** 匹配高亮部分（触发词和参数匹配） */
  matchedText: string;
}

/**
 * 根据当前输入获取命令候选列表（用于浮层渲染）
 */
export function getCandidates(input: string): SlashCandidate[] {
  const trimmed = input.trim();

  // 仅输入 "/" 或 "/ "：展示所有可用 Skill
  if (trimmed === "/" || trimmed === "/ ") {
    return registry.getAll().map((cmd) => ({ command: cmd, matchedText: "" }));
  }

  const parsed = parseSlashInput(trimmed);
  if (!parsed) return [];

  const { trigger, args } = parsed;
  const normalizedTrigger = trigger.toLowerCase();
  const exactSkill = registry.getAll().some((cmd) => cmd.trigger.toLowerCase() === normalizedTrigger);
  if (exactSkill && input.trimEnd() !== input) return [];
  if (exactSkill && args) return [];

  return registry.getAll()
    .filter((cmd) => cmd.trigger.toLowerCase().startsWith(normalizedTrigger))
    .map((cmd) => ({
      command: cmd,
      matchedText: trigger,
    }));
}
