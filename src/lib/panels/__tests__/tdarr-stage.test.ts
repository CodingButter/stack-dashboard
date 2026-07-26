import { describe, expect, it } from "vitest";
import { workerStage } from "../tdarr-stage";

describe("workerStage", () => {
  it("maps Execute to a determinate transcode bar", () => {
    const s = workerStage("Execute");
    expect(s.label).toBe("Transcoding");
    expect(s.bar).toBe("determinate");
    expect(s.isTranscoding).toBe(true);
  });

  it("maps Scanning to an indeterminate analyzing stage (never a stalled 0%)", () => {
    const s = workerStage("Scanning");
    expect(s.label).toBe("Analyzing…");
    expect(s.bar).toBe("indeterminate");
    expect(s.isTranscoding).toBe(false);
  });

  it("maps Replace Original to an indeterminate finalizing stage", () => {
    const s = workerStage("Replace Original");
    expect(s.label).toBe("Finalizing · writing to NAS");
    expect(s.bar).toBe("indeterminate");
    expect(s.isTranscoding).toBe(false);
  });

  it("treats Copy variants as finalizing", () => {
    expect(workerStage("Copy").label).toBe("Finalizing · writing to NAS");
    expect(workerStage("CopyStream").bar).toBe("indeterminate");
  });

  it("maps idle/empty to Idle with no bar", () => {
    expect(workerStage("").label).toBe("Idle");
    expect(workerStage("").bar).toBe("none");
    expect(workerStage("idle").bar).toBe("none");
  });

  it("degrades unknown status strings to a neutral Working stage", () => {
    const s = workerStage("SomeFuturePhase");
    expect(s.label).toBe("Working…");
    expect(s.bar).toBe("indeterminate");
    expect(s.isTranscoding).toBe(false);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(workerStage("  execute  ").isTranscoding).toBe(true);
    expect(workerStage("SCANNING").label).toBe("Analyzing…");
  });
});
