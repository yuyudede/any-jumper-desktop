import type { FC } from "react";
import type { ToolTraceCardModel } from "../../utils/toolTrace";
import { BashResult } from "./BashResult";
import { EditResult } from "./EditResult";
import { ReadWriteResult } from "./ReadWriteResult";
import { SearchResult } from "./SearchResult";
import { WebResult } from "./WebResult";

export type ToolResultRenderer = FC<{ card: ToolTraceCardModel }>;

const registry = new Map<string, ToolResultRenderer>();

function register(names: string[], renderer: ToolResultRenderer) {
  for (const name of names) {
    registry.set(name, renderer);
  }
}

register(["shell"], BashResult);
register(["read_file", "write_file", "list_files"], ReadWriteResult);
register(["edit_file"], EditResult);
register(["search", "grep", "glob"], SearchResult);
register(["web_fetch", "web_search"], WebResult);

export function getToolResultRenderer(
  name: string,
): ToolResultRenderer | null {
  return registry.get(name) ?? null;
}
