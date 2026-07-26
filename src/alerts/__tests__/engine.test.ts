import { describe, expect, it } from "vitest";

import { AlertEngine, type AlertStore, type OpenAlert } from "../engine";
import type { Breach, Rule, RuleInput } from "../types";

function makeMemoryStore(): AlertStore & { open_: OpenAlert[]; resolved: string[] } {
  let seq = 0;
  const open_: OpenAlert[] = [];
  const resolved: string[] = [];
  return {
    open_,
    resolved,
    async listOpen() {
      return open_.filter((a) => !resolved.includes(a.id));
    },
    async open(b: Breach) {
      open_.push({
        id: `a${seq++}`,
        ruleId: b.ruleId,
        target: b.target,
        severity: b.severity,
        message: b.message,
      });
    },
    async refresh(id, b) {
      const a = open_.find((x) => x.id === id);
      if (a) {
        a.message = b.message;
        a.severity = b.severity;
      }
    },
    async resolve(ids) {
      resolved.push(...ids);
    },
  };
}

const baseInput = (): RuleInput => ({
  now: new Date(),
  statuses: [],
  agent: null,
  smart: [],
  tdarrNodes: [],
  sshFailuresLastMin: 0,
  certExpiresInMs: null,
});

// A rule whose breach set is driven by the input's ssh count, for control.
function countRule(strikes: number): Rule {
  return {
    id: "test.rule",
    severity: "warning",
    description: "test",
    strikes,
    evaluate(input) {
      return input.sshFailuresLastMin > 0
        ? [
            {
              ruleId: "test.rule",
              severity: "warning",
              target: "t1",
              message: `n=${input.sshFailuresLastMin}`,
            },
          ]
        : [];
    },
  };
}

describe("AlertEngine two-strike debounce", () => {
  it("does not open on a single breaching cycle", async () => {
    const engine = new AlertEngine([countRule(2)]);
    const store = makeMemoryStore();
    const r = await engine.tick({ ...baseInput(), sshFailuresLastMin: 5 }, store);
    expect(r.opened).toBe(0);
    expect(r.pending).toBe(1);
    expect(store.open_).toHaveLength(0);
  });

  it("opens on the second consecutive breaching cycle", async () => {
    const engine = new AlertEngine([countRule(2)]);
    const store = makeMemoryStore();
    await engine.tick({ ...baseInput(), sshFailuresLastMin: 5 }, store);
    const r = await engine.tick({ ...baseInput(), sshFailuresLastMin: 5 }, store);
    expect(r.opened).toBe(1);
    expect(store.open_).toHaveLength(1);
    expect(store.open_[0].message).toBe("n=5");
  });

  it("resets the streak if a cycle does not breach", async () => {
    const engine = new AlertEngine([countRule(2)]);
    const store = makeMemoryStore();
    await engine.tick({ ...baseInput(), sshFailuresLastMin: 5 }, store); // strike 1
    await engine.tick({ ...baseInput(), sshFailuresLastMin: 0 }, store); // reset
    const r = await engine.tick({ ...baseInput(), sshFailuresLastMin: 5 }, store); // strike 1 again
    expect(r.opened).toBe(0);
    expect(store.open_).toHaveLength(0);
  });

  it("strikes=1 opens immediately", async () => {
    const engine = new AlertEngine([countRule(1)]);
    const store = makeMemoryStore();
    const r = await engine.tick({ ...baseInput(), sshFailuresLastMin: 5 }, store);
    expect(r.opened).toBe(1);
  });
});

describe("AlertEngine refresh + auto-resolve", () => {
  it("refreshes an existing open alert instead of duplicating", async () => {
    const engine = new AlertEngine([countRule(1)]);
    const store = makeMemoryStore();
    await engine.tick({ ...baseInput(), sshFailuresLastMin: 5 }, store);
    const r = await engine.tick({ ...baseInput(), sshFailuresLastMin: 9 }, store);
    expect(r.opened).toBe(0);
    expect(r.refreshed).toBe(1);
    expect(store.open_).toHaveLength(1);
    expect(store.open_[0].message).toBe("n=9");
  });

  it("auto-resolves when the breach clears", async () => {
    const engine = new AlertEngine([countRule(1)]);
    const store = makeMemoryStore();
    await engine.tick({ ...baseInput(), sshFailuresLastMin: 5 }, store);
    const r = await engine.tick({ ...baseInput(), sshFailuresLastMin: 0 }, store);
    expect(r.resolved).toBe(1);
    expect(store.resolved).toEqual([store.open_[0].id]);
    expect(await store.listOpen()).toHaveLength(0);
  });
});

describe("AlertEngine safety", () => {
  it("a throwing rule does not take down the cycle", async () => {
    const bad: Rule = {
      id: "bad",
      severity: "warning",
      description: "boom",
      strikes: 1,
      evaluate() {
        throw new Error("boom");
      },
    };
    const engine = new AlertEngine([bad, countRule(1)]);
    const store = makeMemoryStore();
    const r = await engine.tick({ ...baseInput(), sshFailuresLastMin: 5 }, store);
    expect(r.opened).toBe(1); // countRule still fired
  });

  it("de-dups identical (ruleId,target) breaches from evaluate", () => {
    const dup: Rule = {
      id: "dup",
      severity: "info",
      description: "d",
      strikes: 1,
      evaluate() {
        return [
          { ruleId: "dup", severity: "info", target: "x", message: "a" },
          { ruleId: "dup", severity: "info", target: "x", message: "b" },
        ];
      },
    };
    const engine = new AlertEngine([dup]);
    expect(engine.evaluate(baseInput())).toHaveLength(1);
  });
});
