/**
 * Side-effect module: importing it registers every service poller into the
 * registry. Keeping the wiring in one place means the worker's import list never
 * changes — the runtime just imports this once at startup.
 */
import { register } from "./registry";
import { makeArrPoller } from "./clients/arr";
import { prowlarrPoller } from "./clients/prowlarr";
import { sabnzbdPoller } from "./clients/sabnzbd";
import { tautulliPoller } from "./clients/tautulli";
import { plexPoller } from "./clients/plex";
import { seerrPoller } from "./clients/seerr";
import { tdarrPoller } from "./clients/tdarr";
import { qbittorrentPoller } from "./clients/qbittorrent";
import { makeAgentPoller } from "./clients/agent";

register(makeArrPoller("sonarr"));
register(makeArrPoller("radarr"));
register(prowlarrPoller);
register(sabnzbdPoller);
register(tautulliPoller);
register(plexPoller);
register(seerrPoller);
register(tdarrPoller);
register(qbittorrentPoller);
register(makeAgentPoller("agent", "nas"));

export {};
