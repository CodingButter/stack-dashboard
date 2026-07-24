import { httpFetch, type FetchOptions, type FetchResult } from "@/poller/clients/http";
import { qbitLogin } from "@/poller/clients/qbittorrent";
import { loadServiceConfig, type ServiceConfig } from "@/poller/settings";
import type { ActionResult } from "../types";

export type HttpFn = <T = unknown>(
  url: string,
  opts?: FetchOptions,
) => Promise<FetchResult<T>>;

/**
 * Injectable seam for every action executor: tests pass fakes and assert the
 * exact calls; production binds the real client helpers below.
 */
export interface Deps {
  http: HttpFn;
  cfg: (service: string) => Promise<ServiceConfig>;
  qbitLogin: (base: string, username: string, password: string) => Promise<string | null>;
}

export const realDeps: Deps = {
  http: httpFetch,
  cfg: loadServiceConfig,
  qbitLogin,
};

export function notConfigured(service: string): ActionResult {
  return { ok: false, message: `${service} is not configured — add it in Settings → Services` };
}

export function fromFetch(res: FetchResult<unknown>, okMessage?: string): ActionResult {
  return res.ok
    ? { ok: true, message: okMessage }
    : { ok: false, message: res.error ?? `HTTP ${res.status}` };
}
