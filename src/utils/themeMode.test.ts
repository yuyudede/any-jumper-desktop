import { describe, expect, it } from "vitest";
import {
  SHIKI_LIGHT_THEME,
  resolveThemeMode,
  shikiThemeForMode,
} from "./themeMode";

describe("theme mode resolution", () => {
  it("honors an explicit light theme over a dark system preference", () => {
    expect(resolveThemeMode("light", true)).toBe("light");
    expect(shikiThemeForMode("light")).toBe(SHIKI_LIGHT_THEME);
  });
});
