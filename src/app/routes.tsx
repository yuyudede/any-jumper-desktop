import { Bot, KeyRound } from "lucide-react";

export const routes = [
  { key: "agent", label: "AI会话", icon: <Bot size={16} /> },
  { key: "model", label: "模型配置", icon: <KeyRound size={16} /> },
] as const;

export type RouteKey = (typeof routes)[number]["key"];
