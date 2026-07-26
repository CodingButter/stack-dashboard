/**
 * Tautulli: preferred over scraping Plex for activity + history. The API wraps
 * every payload in { response: { result, data } }; a result !== "success" is a
 * clean failure, not a throw.
 */
import type { Poller } from "../registry";
import type { PollOutcome } from "../persist";
import { httpFetch } from "./http";

export interface TautulliActivity {
  streamCount: number;
  directPlay: number;
  directStream: number;
  transcode: number;
  totalBandwidth: number;
  lanBandwidth: number;
  wanBandwidth: number;
}

interface TautulliEnvelope<T> {
  response?: { result?: string; message?: string | null; data?: T };
}

/** Unwrap the Tautulli envelope, returning data or an error string. */
export function unwrapTautulli<T>(raw: unknown): { data?: T; error?: string } {
  const env = raw as TautulliEnvelope<T>;
  if (env?.response?.result !== "success") {
    return { error: env?.response?.message ?? "tautulli error" };
  }
  return { data: env.response.data };
}

export function parseTautulliActivity(raw: unknown): TautulliActivity | { error: string } {
  const { data, error } = unwrapTautulli<Record<string, unknown>>(raw);
  if (error || !data) return { error: error ?? "no data" };
  return {
    streamCount: Number(data.stream_count ?? 0),
    directPlay: Number(data.stream_count_direct_play ?? 0),
    directStream: Number(data.stream_count_direct_stream ?? 0),
    transcode: Number(data.stream_count_transcode ?? 0),
    totalBandwidth: Number(data.total_bandwidth ?? 0),
    lanBandwidth: Number(data.lan_bandwidth ?? 0),
    wanBandwidth: Number(data.wan_bandwidth ?? 0),
  };
}

export const tautulliPoller: Poller = {
  service: "tautulli",
  configured: (cfg) => Boolean(cfg.url && cfg.apiKey),
  async poll(cfg): Promise<Omit<PollOutcome, "service" | "latencyMs">> {
    const base = cfg.url!.replace(/\/$/, "");
    const key = encodeURIComponent(cfg.apiKey ?? "");
    const res = await httpFetch(`${base}/api/v2?apikey=${key}&cmd=get_activity`);
    if (!res.ok) return { ok: false, error: res.error };

    const parsed = parseTautulliActivity(res.data);
    if ("error" in parsed) return { ok: false, error: parsed.error };

    return {
      ok: true,
      snapshots: [{ kind: "activity", payload: parsed }],
      metrics: [
        { box: "tautulli", metric: "tautulli.streams", value: parsed.streamCount },
        { box: "tautulli", metric: "tautulli.transcode", value: parsed.transcode },
        {
          box: "tautulli",
          metric: "tautulli.bandwidth",
          value: parsed.totalBandwidth,
        },
      ],
    };
  },
};
