import { describe, expect, it } from "vitest";

import { buildRecentlyAdded, type SnapRow } from "@/lib/panels/assemble";
import { recentlyAddedSchema } from "@/lib/panels/schemas";

const NOW = new Date("2026-07-26T12:00:00Z");
const AT = new Date("2026-07-26T11:59:00Z");

function snap(kind: string, payload: unknown): SnapRow {
  return { service: "plex-recent", kind, payload, polledAt: AT };
}

describe("buildRecentlyAdded", () => {
  it("always emits the four carousels in order, even with no snapshots", () => {
    const out = buildRecentlyAdded([], NOW);
    expect(out.sections.map((s) => s.kind)).toEqual([
      "recent-movies",
      "recent-tv",
      "recent-anime-movies",
      "recent-anime-tv",
    ]);
    expect(out.sections.every((s) => s.items.length === 0)).toBe(true);
    // Wire contract holds for the empty page.
    expect(() => recentlyAddedSchema.parse(out)).not.toThrow();
  });

  it("builds art-proxy + Plex deep-link URLs and never leaks a token", () => {
    const out = buildRecentlyAdded(
      [
        snap("recent-movies", {
          machineId: "abc123",
          items: [
            {
              ratingKey: "42",
              title: "Dune",
              thumb: "/library/metadata/42/thumb/171",
              year: 2021,
              episodeCount: 0,
              addedAt: 1000,
            },
          ],
        }),
      ],
      NOW,
    );
    const movies = out.sections.find((s) => s.kind === "recent-movies")!;
    const item = movies.items[0];
    expect(item.artUrl).toBe(
      "/api/plex/art?path=%2Flibrary%2Fmetadata%2F42%2Fthumb%2F171",
    );
    expect(item.plexUrl).toBe(
      "https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F42",
    );
    // No X-Plex-Token anywhere near the browser payload.
    expect(JSON.stringify(out)).not.toContain("X-Plex-Token");
  });

  it("sorts newest-first so a fresh-episode series bubbles to the top", () => {
    const out = buildRecentlyAdded(
      [
        snap("recent-tv", {
          machineId: "m",
          items: [
            { ratingKey: "1", title: "Old", addedAt: 100, episodeCount: 3 },
            { ratingKey: "2", title: "New", addedAt: 900, episodeCount: 12 },
            { ratingKey: "3", title: "Mid", addedAt: 500, episodeCount: 7 },
          ],
        }),
      ],
      NOW,
    );
    const tv = out.sections.find((s) => s.kind === "recent-tv")!;
    expect(tv.items.map((i) => i.title)).toEqual(["New", "Mid", "Old"]);
    expect(tv.items[0].episodeCount).toBe(12);
  });

  it("degrades gracefully when the server identity is unknown", () => {
    const out = buildRecentlyAdded(
      [
        snap("recent-movies", {
          machineId: "",
          items: [{ ratingKey: "7", title: "NoLink", thumb: "", addedAt: 1 }],
        }),
      ],
      NOW,
    );
    const item = out.sections.find((s) => s.kind === "recent-movies")!.items[0];
    expect(item.plexUrl).toBe("");
    expect(item.artUrl).toBe("");
    expect(item.year).toBeNull();
  });
});
