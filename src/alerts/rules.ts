/**
 * The recon rule set (Segment 06). Each rule is a pure predicate over RuleInput.
 * Thresholds live in the mutable ALERT_THRESHOLDS object so the live-proof can
 * lower one below current fill to fire a real alert without harming the stack
 * (see setThreshold / resetThresholds).
 */
import type { Breach, Rule } from "./types";

export const ALERT_THRESHOLDS = {
  /** per-mount fill % that trips a warning valve */
  tierWarnPct: { "/volume2": 80, "/volume1": 90 } as Record<string, number>,
  /** array/disk util % sustained */
  arrayUtilPct: 90,
  /** D-state process count that counts as a hang. 1-2 procs in D is normal
   * during heavy write-back (smbd/kworker flushing a transcode); a real wedge
   * piles up several stuck procs. */
  dstateCount: 3,
  /** ssh failed-auth lines per minute */
  sshBurstPerMin: 20,
  /** SMART temperature ceiling (°C) */
  smartTempC: 60,
  /** breaker-open duration (ms) that escalates to an alert */
  breakerOpenMs: 5 * 60 * 1000,
  /** TLS cert expiry warning window (ms) */
  certExpiryMs: 14 * 24 * 60 * 60 * 1000,
};

type Thresholds = typeof ALERT_THRESHOLDS;

/** Dev/proof override: temporarily change a threshold. Returns a restore fn. */
export function setThreshold<K extends keyof Thresholds>(
  key: K,
  value: Thresholds[K],
): () => void {
  const prev = ALERT_THRESHOLDS[key];
  ALERT_THRESHOLDS[key] = value;
  return () => {
    ALERT_THRESHOLDS[key] = prev;
  };
}

// ------------------------------------------------------------------- rules

/** Container / service reachability — down for two consecutive polls. */
const serviceDown: Rule = {
  id: "service.down",
  severity: "critical",
  description: "A polled service is unreachable.",
  strikes: 2,
  evaluate({ statuses }) {
    return statuses
      .filter((s) => !s.ok)
      .map((s) => ({
        ruleId: "service.down",
        severity: "critical" as const,
        target: s.service,
        message: `${s.service} unreachable${s.error ? `: ${s.error}` : ""}`,
      }));
  },
};

/** Poller circuit-breaker stuck open longer than the escalation window. */
const breakerOpen: Rule = {
  id: "poller.breaker-open",
  severity: "warning",
  description: "A service circuit breaker has been open too long.",
  strikes: 1, // the duration itself is the debounce
  evaluate({ statuses }) {
    return statuses
      .filter(
        (s) =>
          s.breakerOpenMs !== null &&
          s.breakerOpenMs >= ALERT_THRESHOLDS.breakerOpenMs,
      )
      .map((s) => ({
        ruleId: "poller.breaker-open",
        severity: "warning" as const,
        target: s.service,
        message: `${s.service} breaker open for ${Math.round(
          (s.breakerOpenMs ?? 0) / 60000,
        )} min`,
      }));
  },
};

/** Sustained uninterruptible-sleep (D-state) processes — I/O wedge signature. */
const dstateHang: Rule = {
  id: "host.dstate",
  severity: "critical",
  description: "Uninterruptible-sleep processes on the NAS (I/O wedge).",
  // 8 strikes × 15 s alert ticks ≈ 2 min sustained. Normal transcode
  // write-back flaps D-state on and off; a genuine wedge holds it for minutes
  // (the hardware watchdog doesn't reboot until ~15 min), so 2 min is still
  // plenty of lead time without paging on every file move.
  strikes: 8,
  evaluate({ agent }) {
    if (!agent || agent.dstate < ALERT_THRESHOLDS.dstateCount) return [];
    return [
      {
        ruleId: "host.dstate",
        severity: "critical",
        target: agent.box,
        message: `${agent.dstate} process(es) in D-state on ${agent.box}`,
      },
    ];
  },
};

/** Storage tier fill valve — /volume2 at 80 %, /volume1 at 90 %. */
const tierFill: Rule = {
  id: "storage.tier-fill",
  severity: "warning",
  description: "A storage tier crossed its fill valve.",
  strikes: 2,
  evaluate({ agent }) {
    if (!agent) return [];
    const out: Breach[] = [];
    for (const fs of agent.filesystems) {
      const warn = ALERT_THRESHOLDS.tierWarnPct[fs.path];
      if (warn !== undefined && fs.usedPct >= warn) {
        out.push({
          ruleId: "storage.tier-fill",
          severity: fs.usedPct >= warn + 10 ? "critical" : "warning",
          target: fs.path,
          message: `${fs.path} at ${fs.usedPct.toFixed(1)}% (valve ${warn}%)`,
        });
      }
    }
    return out;
  },
};

/** Array/disk device utilization pinned at ceiling. */
const arrayUtil: Rule = {
  id: "storage.array-util",
  severity: "warning",
  description: "A disk device is saturated.",
  strikes: 2,
  evaluate({ agent }) {
    if (!agent) return [];
    return agent.disks
      .filter((d) => d.utilPct >= ALERT_THRESHOLDS.arrayUtilPct)
      .map((d) => ({
        ruleId: "storage.array-util",
        severity: "warning" as const,
        target: d.device,
        message: `${d.device} at ${d.utilPct.toFixed(0)}% util`,
      }));
  },
};

/** SMART health: unhealthy, over-temp, or media errors. */
const smartHealth: Rule = {
  id: "smart.health",
  severity: "critical",
  description: "A drive reports SMART problems.",
  strikes: 2,
  evaluate({ smart }) {
    const out: Breach[] = [];
    for (const d of smart) {
      const reasons: string[] = [];
      if (d.healthy === false) reasons.push("unhealthy");
      if (d.mediaErrors && d.mediaErrors > 0)
        reasons.push(`${d.mediaErrors} media errors`);
      if (d.temperatureC !== null && d.temperatureC >= ALERT_THRESHOLDS.smartTempC)
        reasons.push(`${d.temperatureC}°C`);
      if (reasons.length) {
        out.push({
          ruleId: "smart.health",
          severity: "critical",
          target: d.device,
          message: `${d.device} SMART: ${reasons.join(", ")}`,
        });
      }
    }
    return out;
  },
};

/** SSH failed-auth burst — brute-force signature. */
const sshBurst: Rule = {
  id: "auth.ssh-burst",
  severity: "warning",
  description: "Elevated SSH authentication failures.",
  strikes: 2,
  evaluate({ sshFailuresLastMin }) {
    if (sshFailuresLastMin < ALERT_THRESHOLDS.sshBurstPerMin) return [];
    return [
      {
        ruleId: "auth.ssh-burst",
        severity: "warning",
        target: "sshd",
        message: `${sshFailuresLastMin} SSH auth failures in the last minute`,
      },
    ];
  },
};

/** Tdarr node offline or worker-limit violated (CPU workers where none allowed). */
const tdarrNode: Rule = {
  id: "tdarr.node",
  severity: "warning",
  description: "A Tdarr node is paused or over its worker limit.",
  strikes: 2,
  evaluate({ tdarrNodes }) {
    const out: Breach[] = [];
    for (const n of tdarrNodes) {
      if (n.paused) {
        out.push({
          ruleId: "tdarr.node",
          severity: "info",
          target: n.nodeName,
          message: `${n.nodeName} is paused`,
        });
        continue;
      }
      // NAS node must never run CPU transcode workers — limit is 0.
      if (n.limits.transcodeCpu > 0 && n.nodeName.toLowerCase().includes("nas")) {
        out.push({
          ruleId: "tdarr.node",
          severity: "warning",
          target: n.nodeName,
          message: `${n.nodeName} allows ${n.limits.transcodeCpu} CPU worker(s)`,
        });
      }
    }
    return out;
  },
};

/** Failed systemd units on the NAS. */
const failedUnits: Rule = {
  id: "host.failed-units",
  severity: "warning",
  description: "systemd reports failed units on the NAS.",
  strikes: 2,
  evaluate({ agent }) {
    if (!agent || agent.failedUnits <= 0) return [];
    return [
      {
        ruleId: "host.failed-units",
        severity: "warning",
        target: agent.box,
        message: `${agent.failedUnits} failed systemd unit(s) on ${agent.box}`,
      },
    ];
  },
};

/** TLS cert nearing expiry. */
const certExpiry: Rule = {
  id: "tls.cert-expiry",
  severity: "warning",
  description: "The dashboard TLS certificate is expiring soon.",
  strikes: 1,
  evaluate({ certExpiresInMs }) {
    if (certExpiresInMs === null || certExpiresInMs > ALERT_THRESHOLDS.certExpiryMs)
      return [];
    const days = Math.max(0, Math.floor(certExpiresInMs / 86_400_000));
    return [
      {
        ruleId: "tls.cert-expiry",
        severity: certExpiresInMs <= 0 ? "critical" : "warning",
        target: "tautulli.plexflex.tv",
        message: `certificate expires in ${days} day(s)`,
      },
    ];
  },
};

export const RULES: Rule[] = [
  serviceDown,
  breakerOpen,
  dstateHang,
  tierFill,
  arrayUtil,
  smartHealth,
  sshBurst,
  tdarrNode,
  failedUnits,
  certExpiry,
];
