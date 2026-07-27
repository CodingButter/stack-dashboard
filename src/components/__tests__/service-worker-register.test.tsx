import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServiceWorkerRegister } from "../service-worker-register";

describe("ServiceWorkerRegister", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers /sw.js when serviceWorker is supported", () => {
    const register = vi.fn().mockResolvedValue({});
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    render(<ServiceWorkerRegister />);
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("no-ops when serviceWorker is unsupported", () => {
    vi.stubGlobal("navigator", {});
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
  });
});
