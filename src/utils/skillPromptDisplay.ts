const SKILL_PROMPT_HEADER_RE = /^请使用 Skill「([^」]+)」处理下面的用户请求。\s*\n+用户请求：([\s\S]*?)\n+执行要求：/;

export function displaySkillPrompt(content: string) {
  const match = content.match(SKILL_PROMPT_HEADER_RE);
  if (!match) return content;

  const skillName = match[1]?.trim();
  const userRequest = match[2]?.trim();
  if (!skillName) return content;

  return userRequest
    ? `使用 Skill「${skillName}」：${userRequest}`
    : `使用 Skill「${skillName}」`;
}
