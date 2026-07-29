import { describe, expect, it } from "vitest";

import type { AgentStats, SmartDrive } from "@/poller/clients/agent";
import type { TdarrNode } from "@/poller/clients/tdarr";
import { RULES, ALERT_THRESHOLDS, setThreshold } from "../rules";
import type { RuleInput, StatusInput } from "../types";

function ruleById(id: string) {
  const r = RULES.find((r) => r.id === id);
  if (!r) throw new Error(`no rule ${id}`);
  return r;
}

function status(p: Partial<StatusInput> = {}): StatusInput {
  return {
    service: "plex",
    ok: true,
    error: null,
    consecutiveFailures: 0,
    breakerOpenMs: null,
    ...p,
  };
}

function agent(p: Partial<AgentStats> = {}): AgentStats {
  return {
    box: "nas",
    cpuBusy: 10,
    iowait: 1,
    load1: 1,
    memUsedPct: 40,
    swapUsedPct: 0,
    dstate: 0,
    netRxMbs: 1,
    netTxMbs: 1,
    bcacheHitPct: 90,
    failedUnits: 0,
    uptimeS: 1000,
    filesystems: [{ path: "/volume2", usedPct: 10, totalBytes: 100, usedBytes: 10 }],
    disks: [{ device: "sda", utilPct: 5, awaitMs: 1 }],
    ...p,
  };
}

function smart(p: Partial<SmartDrive> = {}): SmartDrive {
  return {
    device: "nvme0n1",
    healthy: true,
    temperatureC: 30,
    powerOnHours: 100,
    model: "x",
    sparePct: 100,
    mediaErrors: 0,
    ...p,
  };
}

function node(p: Partial<TdarrNode> = {}): TdarrNode {
  return {
    nodeName: "BigBeastNode",
    paused: false,
    workerCount: 1,
    workers: [],
    queue: { transcode: 0, healthcheck: 0 },
    limits: { transcodeCpu: 0, transcodeGpu: 1 },
    ...p,
  };
}

function input(p: Partial<RuleInput> = {}): RuleInput {
  return {
    now: new Date("2026-07-25T00:00:00Z"),
    statuses: [],
    agent: null,
    smart: [],
    tdarrNodes: [],
    sshFailuresLastMin: 0,
    certExpiresInMs: null,
    ...p,
  };
}

describe("alert rules — breach / non-breach pairs", () => {
  it("service.down: fires on !ok, silent when ok", () => {
    const r = ruleById("service.down");
    expect(r.evaluate(input({ statuses: [status({ ok: false, error: "ECONN" })] }))).toHaveLength(1);
    expect(r.evaluate(input({ statuses: [status({ ok: true })] }))).toHaveLength(0);
  });

  it("poller.breaker-open: fires past window, silent under", () => {
    const r = ruleById("poller.breaker-open");
    const over = ALERT_THRESHOLDS.breakerOpenMs + 1;
    expect(r.evaluate(input({ statuses: [status({ breakerOpenMs: over })] }))).toHaveLength(1);
    expect(r.evaluate(input({ statuses: [status({ breakerOpenMs: 1000 })] }))).toHaveLength(0);
  });

  it("host.dstate: fires when dstate >= threshold, silent below", () => {
    const r = ruleById("host.dstate");
    expect(r.evaluate(input({ agent: agent({ dstate: 3 }) }))).toHaveLength(1);
    // 1-2 D-state procs is normal write-back, not a wedge.
    expect(r.evaluate(input({ agent: agent({ dstate: 2 }) }))).toHaveLength(0);
    expect(r.evaluate(input({ agent: agent({ dstate: 0 }) }))).toHaveLength(0);
  });

  it("storage.tier-fill: fires over valve, silent under", () => {
    const r = ruleById("storage.tier-fill");
    const hot = agent({ filesystems: [{ path: "/volume2", usedPct: 85, totalBytes: 1, usedBytes: 1 }] });
    const cool = agent({ filesystems: [{ path: "/volume2", usedPct: 50, totalBytes: 1, usedBytes: 1 }] });
    expect(r.evaluate(input({ agent: hot }))).toHaveLength(1);
    expect(r.evaluate(input({ agent: cool }))).toHaveLength(0);
  });

  it("storage.tier-fill: escalates to critical +10 over valve", () => {
    const r = ruleById("storage.tier-fill");
    const crit = agent({ filesystems: [{ path: "/volume2", usedPct: 95, totalBytes: 1, usedBytes: 1 }] });
    expect(r.evaluate(input({ agent: crit }))[0].severity).toBe("critical");
  });

  it("storage.array-util: fires at ceiling, silent under", () => {
    const r = ruleById("storage.array-util");
    expect(r.evaluate(input({ agent: agent({ disks: [{ device: "sda", utilPct: 95, awaitMs: 5 }] }) }))).toHaveLength(1);
    expect(r.evaluate(input({ agent: agent({ disks: [{ device: "sda", utilPct: 20, awaitMs: 5 }] }) }))).toHaveLength(0);
  });

  it("storage.array-util: requires ~5 min sustained (20 strikes)", () => {
    // Scheduled bulk I/O (tier-mover, backups) pins disks for a couple of
    // minutes — only saturation that persists past that should open.
    expect(ruleById("storage.array-util").strikes).toBe(20);
  });

  it("smart.health: fires on unhealthy/media-errors/over-temp, silent when clean", () => {
    const r = ruleById("smart.health");
    expect(r.evaluate(input({ smart: [smart({ healthy: false })] }))).toHaveLength(1);
    expect(r.evaluate(input({ smart: [smart({ mediaErrors: 4 })] }))).toHaveLength(1);
    expect(r.evaluate(input({ smart: [smart({ temperatureC: 70 })] }))).toHaveLength(1);
    expect(r.evaluate(input({ smart: [smart()] }))).toHaveLength(0);
  });

  it("auth.ssh-burst: fires over rate, silent under", () => {
    const r = ruleById("auth.ssh-burst");
    expect(r.evaluate(input({ sshFailuresLastMin: 25 }))).toHaveLength(1);
    expect(r.evaluate(input({ sshFailuresLastMin: 3 }))).toHaveLength(0);
  });

  it("tdarr.node: fires on paused and on NAS CPU-worker violation, silent when healthy", () => {
    const r = ruleById("tdarr.node");
    expect(r.evaluate(input({ tdarrNodes: [node({ paused: true })] }))).toHaveLength(1);
    expect(
      r.evaluate(input({ tdarrNodes: [node({ nodeName: "NasTNode", limits: { transcodeCpu: 2, transcodeGpu: 1 } })] })),
    ).toHaveLength(1);
    expect(r.evaluate(input({ tdarrNodes: [node()] }))).toHaveLength(0);
  });

  it("host.failed-units: fires when > 0, silent at 0", () => {
    const r = ruleById("host.failed-units");
    expect(r.evaluate(input({ agent: agent({ failedUnits: 2 }) }))).toHaveLength(1);
    expect(r.evaluate(input({ agent: agent({ failedUnits: 0 }) }))).toHaveLength(0);
  });

  it("tls.cert-expiry: fires inside window, silent well outside", () => {
    const r = ruleById("tls.cert-expiry");
    expect(r.evaluate(input({ certExpiresInMs: 3 * 86_400_000 }))).toHaveLength(1);
    expect(r.evaluate(input({ certExpiresInMs: 90 * 86_400_000 }))).toHaveLength(0);
  });

  it("every rule has a test", () => {
    // guardrail: if a rule is added without a breach/non-breach pair above,
    // this reminds us. Keep in sync with the it() blocks.
    expect(RULES.map((r) => r.id).sort()).toEqual(
      [
        "auth.ssh-burst",
        "host.dstate",
        "host.failed-units",
        "poller.breaker-open",
        "smart.health",
        "storage.array-util",
        "storage.tier-fill",
        "service.down",
        "tdarr.node",
        "tls.cert-expiry",
      ].sort(),
    );
  });
});

describe("setThreshold override", () => {
  it("lowers a tier valve then restores it", () => {
    const r = ruleById("storage.tier-fill");
    const at12 = agent({ filesystems: [{ path: "/volume2", usedPct: 12, totalBytes: 1, usedBytes: 1 }] });
    expect(r.evaluate(input({ agent: at12 }))).toHaveLength(0);
    const restore = setThreshold("tierWarnPct", { "/volume2": 10, "/volume1": 90 });
    expect(r.evaluate(input({ agent: at12 }))).toHaveLength(1);
    restore();
    expect(r.evaluate(input({ agent: at12 }))).toHaveLength(0);
  });
});
