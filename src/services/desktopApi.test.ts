import { describe, expect, it } from "vitest";
import { errorDetail, errorMessage } from "./desktopApi";

describe("desktopApi error helpers", () => {
  it("reads message and detail from Electron IPC style errors", () => {
    const error = { message: "失败", detail: "detail" };
    expect(errorMessage(error)).toBe("失败");
    expect(errorDetail(error)).toBe("detail");
  });

  it("parses structured errors serialized through Electron IPC", () => {
    const error = {
      message: "Error invoking remote method 'any-jumper:invoke': Error: ANY_JUMPER_ERROR:{\"message\":\"缺少 API Key\",\"detail\":\"provider=foo\"}",
    };
    expect(errorMessage(error)).toBe("缺少 API Key");
    expect(errorDetail(error)).toBe("provider=foo");
  });
});
