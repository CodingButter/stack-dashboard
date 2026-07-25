/**
 * The canonical list of pollable services and what config each needs. Drives
 * both the /settings/services form and (in S3.2) the client registry. Auth
 * kinds reflect the live-API facts proven in research.
 */
export type AuthKind = "apikey-header" | "apikey-query" | "token" | "userpass" | "none";

export interface ServiceDef {
  /** stable id used as the settings key prefix and `service` column value. */
  id: string;
  label: string;
  auth: AuthKind;
  /** default URL hint shown as placeholder. */
  urlHint: string;
}

export const SERVICES: ServiceDef[] = [
  { id: "agent", label: "NAS Agent", auth: "token", urlHint: "http://<nas-tailnet-ip>:9101" },
  { id: "agent-bigbeast", label: "GPU Agent — bigbeast", auth: "token", urlHint: "http://<bigbeast-tailnet-ip>:9101" },
  { id: "agent-zenbeast", label: "GPU Agent — zenbeast", auth: "token", urlHint: "http://<zenbeast-tailnet-ip>:9101" },
  { id: "plex", label: "Plex", auth: "token", urlHint: "http://<nas>:32400" },
  { id: "tautulli", label: "Tautulli", auth: "apikey-query", urlHint: "http://<nas>:8181" },
  { id: "sonarr", label: "Sonarr", auth: "apikey-header", urlHint: "http://<nas>:8989" },
  { id: "radarr", label: "Radarr", auth: "apikey-header", urlHint: "http://<nas>:7878" },
  { id: "prowlarr", label: "Prowlarr", auth: "apikey-header", urlHint: "http://<nas>:9696" },
  { id: "seerr", label: "Seerr", auth: "apikey-header", urlHint: "http://<nas>:5055" },
  { id: "sabnzbd", label: "SABnzbd", auth: "apikey-query", urlHint: "http://<nas>:8080" },
  { id: "qbittorrent", label: "qBittorrent", auth: "userpass", urlHint: "http://<nas>:8081" },
  { id: "tdarr", label: "Tdarr", auth: "apikey-header", urlHint: "http://<nas>:8266" },
];

export function serviceDef(id: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.id === id);
}
