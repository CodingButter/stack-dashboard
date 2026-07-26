import { describe, expect, it } from "vitest";

import { formatMbps, formatMbpsValue } from "@/lib/format";

describe("formatMbps (bytes/s → MB/s)", () => {
  it("scales bytes per second to one-decimal MB/s", () => {
    expect(formatMbps(12 * 1024 * 1024)).toBe("12.0 MB/s");
    expect(formatMbps(1_500_000)).toBe("1.4 MB/s");
  });

  it("shows 0.0 MB/s for zero, negative, or non-finite input", () => {
    expect(formatMbps(0)).toBe("0.0 MB/s");
    expect(formatMbps(-5)).toBe("0.0 MB/s");
    expect(formatMbps(Number.NaN)).toBe("0.0 MB/s");
  });
});

describe("formatMbpsValue (already MB/s)", () => {
  it("rounds an already-MB/s value to one decimal", () => {
    expect(formatMbpsValue(12.3456)).toBe("12.3 MB/s");
    expect(formatMbpsValue(0)).toBe("0.0 MB/s");
    expect(formatMbpsValue(Number.NaN)).toBe("0.0 MB/s");
  });
});
