"use client";

import * as React from "react";

import type {
  TelemetryState,
  TelemetrySnapshot,
  MachineSnapshot,
} from "@/server/telemetry-listener";
import { TELEMETRY_WS_PATH } from "@/server/telemetry-path";

/**
 * Live telemetry over one WebSocket, shared by the whole dashboard.
 *
 * Holds the latest pushed {@link TelemetryState} plus a `live` flag that is true
 * only while the socket is open AND the server reports the feed connected. On
 * socket close it auto-reconnects with capped exponential backoff. Panels read
 * their slice through the selector hooks below and fall back to HTTP polling
 * whenever `live` is false, so a dropped feed never blanks the UI.
 */

/** What consumers see: the server state plus our own socket-health flag. */
export interface TelemetryContextValue {
  /** True when the socket is open and the NAS feed is connected & fresh. */
  live: boolean;
  /** True while the WebSocket itself is open (regardless of feed freshness). */
  socketOpen: boolean;
  snapshot: TelemetrySnapshot | null;
  machines: Record<string, MachineSnapshot>;
}

const EMPTY: TelemetryContextValue = {
  live: false,
  socketOpen: false,
  snapshot: null,
  machines: {},
};

const TelemetryContext = React.createContext<TelemetryContextValue>(EMPTY);

interface WireMessage extends TelemetryState {
  type: "telemetry";
}

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 15_000;

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${TELEMETRY_WS_PATH}`;
}

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = React.useState<TelemetryContextValue>(EMPTY);

  React.useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = MIN_BACKOFF_MS;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        backoff = MIN_BACKOFF_MS;
        setValue((v) => ({ ...v, socketOpen: true }));
      };

      ws.onmessage = (ev) => {
        let msg: WireMessage;
        try {
          msg = JSON.parse(ev.data as string) as WireMessage;
        } catch {
          return;
        }
        if (msg.type !== "telemetry") return;
        setValue({
          live: msg.connected === true,
          socketOpen: true,
          snapshot: msg.snapshot ?? null,
          machines: msg.machines ?? {},
        });
      };

      const onDown = () => {
        // Mark not-live but keep last snapshot so panels can decide to fall back.
        setValue((v) => ({ ...v, live: false, socketOpen: false }));
        scheduleReconnect();
      };
      ws.onerror = onDown;
      ws.onclose = onDown;
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        connect();
      }, backoff);
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  return (
    <TelemetryContext.Provider value={value}>
      {children}
    </TelemetryContext.Provider>
  );
}

/** Raw context access — prefer the selector hooks below. */
export function useTelemetry(): TelemetryContextValue {
  return React.useContext(TelemetryContext);
}

/** Governor slice — `null` when the feed is offline (caller falls back to HTTP). */
export function useGovernorTelemetry() {
  const { live, snapshot } = useTelemetry();
  return {
    live,
    governor: live ? snapshot?.governor ?? null : null,
  };
}

/** NAS vitals slice (load1, mem, net). */
export function useVitalsTelemetry() {
  const { live, snapshot } = useTelemetry();
  return {
    live,
    vitals: live ? snapshot?.vitals ?? null : null,
  };
}

/** Stream counts (active sessions, aggregate kbps). */
export function useStreamsTelemetry() {
  const { live, snapshot } = useTelemetry();
  return {
    live,
    streams: live ? snapshot?.streams ?? null : null,
  };
}

/** Downloads slice (SAB + qBit live speed/queue/items). `null` when offline. */
export function useDownloadsTelemetry() {
  const { live, snapshot } = useTelemetry();
  return {
    live,
    downloads: live ? snapshot?.downloads ?? null : null,
  };
}

/** Per-box machine stats for the machines page (vitals + gpu). */
export function useMachineTelemetry(box: string) {
  const { machines } = useTelemetry();
  const m = machines[box];
  return {
    live: Boolean(m?.connected),
    machine: m?.connected ? m : null,
  };
}
