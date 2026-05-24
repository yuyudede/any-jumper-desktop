import { describe, expect, it } from "vitest";
import { formatElectronShortcutFromEvent } from "./keyboardShortcut";

function keyEvent(init: {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}) {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...init,
  } as KeyboardEvent;
}

describe("formatElectronShortcutFromEvent", () => {
  it("records command combinations as CommandOrControl accelerators", () => {
    const shortcut = formatElectronShortcutFromEvent(
      keyEvent({ key: "j", metaKey: true, shiftKey: true }),
    );

    expect(shortcut).toBe("CommandOrControl+Shift+J");
  });

  it("records alt space shortcuts", () => {
    const shortcut = formatElectronShortcutFromEvent(
      keyEvent({ key: " ", altKey: true }),
    );

    expect(shortcut).toBe("Alt+Space");
  });

  it("uses physical key codes for option-modified letters on macOS", () => {
    const shortcut = formatElectronShortcutFromEvent(
      keyEvent({ key: "Å", code: "KeyA", metaKey: true, altKey: true }),
    );

    expect(shortcut).toBe("CommandOrControl+Alt+A");
  });

  it("ignores modifier-only key presses", () => {
    const shortcut = formatElectronShortcutFromEvent(
      keyEvent({ key: "Shift", shiftKey: true }),
    );

    expect(shortcut).toBeNull();
  });
});
