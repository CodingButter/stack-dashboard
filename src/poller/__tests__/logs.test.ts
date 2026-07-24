import { describe, expect, it } from "vitest";

import {
  LOG_SIZE_CAP_BYTES,
  NAS_JOURNAL_UNITS,
  chunk,
  classifyDockerLine,
  clampSeverity,
  normalizeJournalEntry,
  parseDockerText,
  pullDocker,
  pullJournalFamily,
  pullLogsWithStore,
  sizeCapBreached,
  type AgentFetcher,
  type CursorState,
  type JournalResponse,
  type LogSourceKind,
  type LogStore,
  type NormalizedLine,
} from "../logs";

// ------------------------------------------------------------ test doubles

interface StoredBatch {
  box: string;
  source: LogSourceKind;
  unit: string;
  lines: NormalizedLine[];
}

function makeMemoryStore(containers: string[] = []): LogStore & {
  batches: StoredBatch[];
  cursors: Map<string, CursorState>;
} {
  const cursors = new Map<string, CursorState>();
  const batches: StoredBatch[] = [];
  return {
    batches,
    cursors,
    async loadCursor(box, source, unit) {
      return cursors.get(`${box}:${source}:${unit}`) ?? { cursor: null, sinceUnix: null };
    },
    async commitBatch(box, source, unit, lines, next) {
      batches.push({ box, source, unit, lines });
      cursors.set(`${box}:${source}:${unit}`, next);
    },
    async containerNames() {
      return containers;
    },
  };
}

function agentFrom(routes: Record<string, unknown>): AgentFetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async get<T>(path: string): Promise<T | null> {
      calls.push(path);
      const key = Object.keys(routes).find((k) => path.startsWith(k));
      return key ? (routes[key] as T) : null;
    },
  };
}

// ---------------------------------------------------------- normalization

describe("normalizeJournalEntry", () => {
  it("converts microsecond timestamps and clamps priority", () => {
    const line = normalizeJournalEntry({
      ts_us: 1_753_380_000_000_000,
      unit: "tier-mover.service",
      priority: "3",
      message: "move failed",
    });
    expect(line).not.toBeNull();
    expect(line!.ts.toISOString()).toBe("2025-07-24T18:00:00.000Z");
    expect(line!.severity).toBe(3);
    expect(line!.message).toBe("move failed");
  });

  it("drops entries without message or timestamp", () => {
    expect(
      normalizeJournalEntry({ ts_us: null, unit: null, priority: "6", message: "x" }),
    ).toBeNull();
    expect(
      normalizeJournalEntry({ ts_us: 1, unit: null, priority: "6", message: null }),
    ).toBeNull();
  });
});

describe("clampSeverity", () => {
  it("defaults to info and clamps out-of-range values", () => {
    expect(clampSeverity(null)).toBe(6);
    expect(clampSeverity("nope")).toBe(6);
    expect(clampSeverity("0")).toBe(0);
    expect(clampSeverity("99")).toBe(7);
    expect(clampSeverity("-3")).toBe(0);
  });
});

describe("classifyDockerLine", () => {
  it("maps content markers to syslog-ish severities", () => {
    expect(classifyDockerLine("FATAL: cannot bind")).toBe(2);
    expect(classifyDockerLine("Error: connection refused")).toBe(3);
    expect(classifyDockerLine("Warning: deprecated option")).toBe(4);
    expect(classifyDockerLine("DEBUG probing cache")).toBe(7);
    expect(classifyDockerLine("started server on :8081")).toBe(6);
  });
});

describe("parseDockerText", () => {
  it("parses timestamped lines and skips garbage", () => {
    const text = [
      "2026-07-24T18:00:01.123456789Z [info] queue idle",
      "not-a-timestamp line",
      "2026-07-24T18:00:02.000000000Z Error: boom",
      "",
    ].join("\n");
    const lines = parseDockerText(text);
    expect(lines).toHaveLength(2);
    expect(lines[0].message).toBe("[info] queue idle");
    expect(lines[1].severity).toBe(3);
  });
});

describe("chunk", () => {
  it("splits into batches of the given size", () => {
    const parts = chunk([1, 2, 3, 4, 5], 2);
    expect(parts).toEqual([[1, 2], [3, 4], [5]]);
  });
});

// ------------------------------------------------------- cursor semantics

const JOURNAL_PAGE_1: JournalResponse = {
  entries: [
    { ts_us: 1_000_000_000_000, unit: "tier-mover.service", priority: "6", message: "run start" },
    { ts_us: 1_000_001_000_000, unit: "tier-mover.service", priority: "4", message: "slow disk" },
  ],
  cursor: "CUR-1",
};

const JOURNAL_EMPTY_SAME_CURSOR: JournalResponse = { entries: [], cursor: "CUR-1" };

describe("pullJournalFamily cursor resume", () => {
  it("persists the cursor with its batch and sends it on the next pull", async () => {
    const store = makeMemoryStore();
    const agent1 = agentFrom({ "/logs/journal": JOURNAL_PAGE_1 });
    const n1 = await pullJournalFamily(store, agent1, "nas", "journal", "tier-mover", "/logs/journal");
    expect(n1).toBe(2);
    expect(store.cursors.get("nas:journal:tier-mover")).toEqual({
      cursor: "CUR-1",
      sinceUnix: null,
    });
    expect(agent1.calls[0]).not.toContain("cursor=");

    // Simulated restart: new agent, same store — cursor must be sent.
    const agent2 = agentFrom({ "/logs/journal": JOURNAL_EMPTY_SAME_CURSOR });
    const n2 = await pullJournalFamily(store, agent2, "nas", "journal", "tier-mover", "/logs/journal");
    expect(agent2.calls[0]).toContain("cursor=CUR-1");
    expect(n2).toBe(0);
    // No new batch was committed — no duplicates.
    expect(store.batches).toHaveLength(1);
  });

  it("does not advance the cursor when the agent is unreachable", async () => {
    const store = makeMemoryStore();
    const agent = agentFrom({});
    const n = await pullJournalFamily(store, agent, "nas", "auth", "sshd", "/logs/auth");
    expect(n).toBe(0);
    expect(store.cursors.size).toBe(0);
  });
});

describe("pullDocker watermark", () => {
  const NOW = 1_753_380_600; // unix seconds

  it("first pull uses a 5-minute lookback, then stores a millisecond watermark", async () => {
    const store = makeMemoryStore();
    const lineMs = Date.parse("2026-07-24T18:09:59.500Z");
    const agent = agentFrom({
      "/logs/docker": {
        container: "sabnzbd",
        since: NOW - 300,
        text: "2026-07-24T18:09:59.500000000Z queue resumed\n",
      },
    });
    const n = await pullDocker(store, agent, "nas", "sabnzbd", NOW);
    expect(n).toBe(1);
    expect(agent.calls[0]).toContain(`since=${NOW - 300}`);
    const next = store.cursors.get("nas:docker:sabnzbd")!;
    expect(next.cursor).toBe(String(lineMs));
    expect(next.sinceUnix).toBe(Math.floor(lineMs / 1000));
  });

  it("filters lines at or before the ms watermark — sub-second boundary lines never duplicate", async () => {
    const store = makeMemoryStore();
    const watermarkMs = Date.parse("2026-07-24T18:00:00.250Z");
    store.cursors.set("nas:docker:plex", {
      cursor: String(watermarkMs),
      sinceUnix: Math.floor(watermarkMs / 1000),
    });
    const agent = agentFrom({
      "/logs/docker": {
        container: "plex",
        since: Math.floor(watermarkMs / 1000),
        text: [
          // Same second as the watermark, earlier or equal ms — already ingested.
          "2026-07-24T18:00:00.100000000Z old line",
          "2026-07-24T18:00:00.250000000Z watermark line",
          // Same second, later ms — genuinely new.
          "2026-07-24T18:00:00.900000000Z new sub-second line",
          "2026-07-24T18:00:05.000000000Z new line",
        ].join("\n"),
      },
    });
    const n = await pullDocker(store, agent, "nas", "plex", Math.floor(watermarkMs / 1000) + 60);
    // The agent was asked to re-fetch from the watermark second...
    expect(agent.calls[0]).toContain(`since=${Math.floor(watermarkMs / 1000)}`);
    // ...but only strictly-newer lines were committed.
    expect(n).toBe(2);
    expect(store.batches[0].lines.map((l) => l.message)).toEqual([
      "new sub-second line",
      "new line",
    ]);
  });

  it("does not commit or advance when nothing is new", async () => {
    const store = makeMemoryStore();
    const watermarkMs = Date.parse("2026-07-24T18:00:00.500Z");
    store.cursors.set("nas:docker:plex", {
      cursor: String(watermarkMs),
      sinceUnix: Math.floor(watermarkMs / 1000),
    });
    const agent = agentFrom({
      "/logs/docker": {
        container: "plex",
        since: Math.floor(watermarkMs / 1000),
        text: "2026-07-24T18:00:00.500000000Z watermark line\n",
      },
    });
    const n = await pullDocker(store, agent, "nas", "plex", 0);
    expect(n).toBe(0);
    expect(store.batches).toHaveLength(0);
    expect(store.cursors.get("nas:docker:plex")!.cursor).toBe(String(watermarkMs));
  });
});

describe("pullLogsWithStore", () => {
  it("covers every journal unit, auth, kernel, and discovered containers", async () => {
    const store = makeMemoryStore(["plex", "sabnzbd"]);
    const agent = agentFrom({
      "/logs/journal": JOURNAL_PAGE_1,
      "/logs/auth": { entries: [], cursor: null },
      "/logs/kernel": { entries: [], cursor: null },
      "/logs/docker": { container: "x", since: 0, text: "" },
    });
    const result = await pullLogsWithStore(store, agent, "nas", 1_753_380_600);
    expect(result.errors).toEqual([]);
    const journalCalls = agent.calls.filter((c) => c.startsWith("/logs/journal"));
    expect(journalCalls).toHaveLength(NAS_JOURNAL_UNITS.length);
    expect(agent.calls.some((c) => c.startsWith("/logs/auth"))).toBe(true);
    expect(agent.calls.some((c) => c.startsWith("/logs/kernel"))).toBe(true);
    const dockerCalls = agent.calls.filter((c) => c.startsWith("/logs/docker"));
    expect(dockerCalls).toHaveLength(2);
  });

  it("isolates per-source failures instead of aborting the cycle", async () => {
    const store = makeMemoryStore();
    const agent: AgentFetcher = {
      async get<T>(path: string): Promise<T | null> {
        if (path.startsWith("/logs/auth")) throw new Error("boom");
        return { entries: [], cursor: null } as T;
      },
    };
    const result = await pullLogsWithStore(store, agent, "nas", 0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("auth:sshd");
  });
});

// -------------------------------------------------------------- retention

describe("sizeCapBreached", () => {
  it("triggers only above the 5 GB cap", () => {
    expect(sizeCapBreached(LOG_SIZE_CAP_BYTES - 1)).toBe(false);
    expect(sizeCapBreached(LOG_SIZE_CAP_BYTES)).toBe(false);
    expect(sizeCapBreached(LOG_SIZE_CAP_BYTES + 1)).toBe(true);
  });
});
