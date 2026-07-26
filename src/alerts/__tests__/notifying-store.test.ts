import { describe, expect, it, vi } from "vitest";

import { makeNotifyingStore, eventTypeForBreach, buildAlertPayload } from "../notifying-store";
import type { AlertStore } from "../engine";
import type { Breach } from "../types";

function fakeInner(): AlertStore {
  return {
    listOpen: vi.fn().mockResolvedValue([]),
    open: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue(undefined),
  };
}

function breach(over: Partial<Breach>): Breach {
  return {
    ruleId: "service.down",
    severity: "critical",
    target: "sonarr",
    message: "sonarr unreachable",
    ...over,
  };
}

const NOW = new Date("2026-07-26T00:00:00Z");

describe("eventTypeForBreach", () => {
  it("maps plex service.down to plex_down and others to service_down", () => {
    expect(eventTypeForBreach(breach({ target: "plex" }))).toBe("plex_down");
    expect(eventTypeForBreach(breach({ target: "Plex" }))).toBe("plex_down");
    expect(eventTypeForBreach(breach({ target: "sonarr" }))).toBe("service_down");
  });

  it("maps infra rules to their event types", () => {
    expect(eventTypeForBreach(breach({ ruleId: "tdarr.node" }))).toBe("tdarr_node_failure");
    expect(eventTypeForBreach(breach({ ruleId: "smart.health" }))).toBe("smart_health");
    expect(eventTypeForBreach(breach({ ruleId: "storage.tier-fill" }))).toBe("storage");
    expect(eventTypeForBreach(breach({ ruleId: "storage.array-util" }))).toBe("storage");
    expect(eventTypeForBreach(breach({ ruleId: "host.dstate" }))).toBe("io_overload");
    expect(eventTypeForBreach(breach({ ruleId: "poller.breaker-open" }))).toBe("io_overload");
    expect(eventTypeForBreach(breach({ ruleId: "auth.ssh-burst" }))).toBe("ssh_burst");
  });

  it("returns null for rules with no push mapping", () => {
    expect(eventTypeForBreach(breach({ ruleId: "host.failed-units" }))).toBeNull();
    expect(eventTypeForBreach(breach({ ruleId: "tls.cert-expiry" }))).toBeNull();
  });
});

describe("buildAlertPayload", () => {
  it("builds a payload pointing at /alerts with the message as body", () => {
    const p = buildAlertPayload(breach({ target: "plex", message: "plex unreachable" }));
    expect(p.body).toBe("plex unreachable");
    expect(p.url).toBe("/alerts");
    expect(p.title).toContain("plex");
  });
});

describe("makeNotifyingStore", () => {
  it("open() delegates to the inner store then pushes for a mapped rule", async () => {
    const inner = fakeInner();
    const sendPush = vi.fn().mockResolvedValue(1);
    const store = makeNotifyingStore(inner, sendPush);

    const b = breach({ ruleId: "tdarr.node", target: "gpu-node" });
    await store.open(b, NOW);

    expect(inner.open).toHaveBeenCalledWith(b, NOW);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith("tdarr_node_failure", expect.objectContaining({ url: "/alerts" }));
  });

  it("open() does NOT push for an unmapped rule", async () => {
    const inner = fakeInner();
    const sendPush = vi.fn().mockResolvedValue(0);
    const store = makeNotifyingStore(inner, sendPush);

    await store.open(breach({ ruleId: "tls.cert-expiry" }), NOW);

    expect(inner.open).toHaveBeenCalledTimes(1);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("refresh() and resolve() never push", async () => {
    const inner = fakeInner();
    const sendPush = vi.fn().mockResolvedValue(1);
    const store = makeNotifyingStore(inner, sendPush);

    await store.refresh("id1", breach({ ruleId: "tdarr.node" }), NOW);
    await store.resolve(["id1"], NOW);

    expect(inner.refresh).toHaveBeenCalledTimes(1);
    expect(inner.resolve).toHaveBeenCalledTimes(1);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("open() still opens the alert even if sendPush throws", async () => {
    const inner = fakeInner();
    const sendPush = vi.fn().mockRejectedValue(new Error("boom"));
    const store = makeNotifyingStore(inner, sendPush);

    await expect(store.open(breach({ ruleId: "smart.health" }), NOW)).resolves.toBeUndefined();
    expect(inner.open).toHaveBeenCalledTimes(1);
  });

  it("open() opens the alert before attempting to push", async () => {
    const order: string[] = [];
    const inner = fakeInner();
    (inner.open as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("open");
    });
    const sendPush = vi.fn().mockImplementation(async () => {
      order.push("push");
      return 1;
    });
    const store = makeNotifyingStore(inner, sendPush);

    await store.open(breach({ ruleId: "smart.health" }), NOW);
    expect(order).toEqual(["open", "push"]);
  });
});
