// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";

import * as api from "./index.js";

describe("public surface", () => {
  it("exports every primitive", () => {
    expect(typeof api.viewTransition).toBe("function");
    expect(typeof api.trapFocus).toBe("function");
    expect(typeof api.announce).toBe("function");
    expect(typeof api.createTheme).toBe("function");
    expect(typeof api.themeInitSnippet).toBe("function");
    expect(typeof api.createDialog).toBe("function");
    expect(typeof api.openModal).toBe("function");
    expect(typeof api.closeModal).toBe("function");
    expect(typeof api.confirm).toBe("function");
    expect(typeof api.initTooltips).toBe("function");
    expect(typeof api.createToaster).toBe("function");
    expect(typeof api.info).toBe("function");
    expect(typeof api.success).toBe("function");
    expect(typeof api.error).toBe("function");
    expect(typeof api.toast.show).toBe("function");
  });
});
