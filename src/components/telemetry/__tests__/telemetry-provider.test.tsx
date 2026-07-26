import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";

import {
  TelemetryProvider,
  useTelemetry,
  useGovernorTelemetry,
} from "../telemetry-provider";

/** Minimal controllable WebSocket stand-in. */
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  OPEN = 1;
  close = vi.fn(() => {
    this.readyState = 3;
  });
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  fireClose() {
    this.onclose?.();
  }
}

const nasFrame = (seq: number, connected = true) => ({
  type: "telemetry",
  connected,
  snapshot: {
    seq,
    sentTs: 1000,
    intervalMs: 500,
    host: "nas",
    governor: connected ? { running: true, nodes: [] } : null,
    vitals: { load1: 1, memAvailGb: 20, net: { rxBytes: 0, txBytes: 0 } },
    streams: { active: 2, kbps: 5000 },
  },
  machines: {},
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <TelemetryProvider>{children}</TelemetryProvider>;
}

describe("TelemetryProvider", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal("location", { protocol: "http:", host: "localhost:3000" });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("propagates a pushed snapshot and marks live", () => {
    const { result } = renderHook(() => useTelemetry(), { wrapper });
    expect(result.current.live).toBe(false);

    act(() => {
      FakeWebSocket.instances[0].open();
      FakeWebSocket.instances[0].emit(nasFrame(7));
    });

    expect(result.current.live).toBe(true);
    expect(result.current.snapshot?.seq).toBe(7);
    expect(result.current.snapshot?.streams.active).toBe(2);
  });

  it("hides the governor slice when the feed reports disconnected", () => {
    const { result } = renderHook(() => useGovernorTelemetry(), { wrapper });

    act(() => {
      FakeWebSocket.instances[0].open();
      FakeWebSocket.instances[0].emit(nasFrame(3, false));
    });

    expect(result.current.live).toBe(false);
    expect(result.current.governor).toBeNull();
  });

  it("reconnects after the socket closes", () => {
    render(
      <TelemetryProvider>
        <span>x</span>
      </TelemetryProvider>,
    );
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => {
      FakeWebSocket.instances[0].open();
      FakeWebSocket.instances[0].fireClose();
    });
    // backoff timer (1s) fires → a second socket is created
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
  });
});
