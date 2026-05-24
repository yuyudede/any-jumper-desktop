type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

const modifierOnlyKeys = new Set([
  "Alt",
  "Control",
  "Ctrl",
  "Meta",
  "OS",
  "Option",
  "Shift",
  "Command",
]);

const specialKeys: Record<string, string> = {
  " ": "Space",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  Backspace: "Backspace",
  Delete: "Delete",
  Enter: "Return",
  Escape: "Esc",
  Esc: "Esc",
  Tab: "Tab",
};

function normalizeShortcutKey(event: ShortcutKeyEvent) {
  const { code, key } = event;
  if (modifierOnlyKeys.has(key)) return null;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `num${code.slice(6)}`;
  if (specialKeys[key]) return specialKeys[key];
  if (/^F\d{1,2}$/i.test(key)) return key.toUpperCase();
  if (key.length === 1) return key.toUpperCase();
  return key.replace(/\s+/g, "");
}

export function formatElectronShortcutFromEvent(event: ShortcutKeyEvent) {
  const key = normalizeShortcutKey(event);
  if (!key) return null;

  const parts: string[] = [];
  if (event.metaKey) parts.push("CommandOrControl");
  else if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  if (parts.length === 0 && !/^F\d{1,2}$/.test(key)) return null;
  parts.push(key);
  return parts.join("+");
}
