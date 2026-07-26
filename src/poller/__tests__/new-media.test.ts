import { describe, expect, it, vi } from "vitest";

import { NewMediaDetector, dispatchNewMedia } from "../new-media";
import type { RecentItem } from "../clients/plex-recent";

function item(over: Partial<RecentItem>): RecentItem {
  return {
    ratingKey: "1",
    title: "Untitled",
    type: "movie",
    thumb: "",
    addedAt: 0,
    year: null,
    episodeCount: 0,
    ...over,
  };
}

function snap(kind: string, items: RecentItem[], machineId = "MACHINE") {
  return { kind, payload: { machineId, items } };
}

describe("NewMediaDetector.detect", () => {
  it("seeds silently on the first observation of a kind (no events)", () => {
    const d = new NewMediaDetector();
    const events = d.detect([snap("recent-movies", [item({ ratingKey: "1" })])]);
    expect(events).toEqual([]);
  });

  it("fires an event for a ratingKey that appears after the seed poll", () => {
    const d = new NewMediaDetector();
    d.detect([snap("recent-movies", [item({ ratingKey: "1", title: "Old" })])]);
    const events = d.detect([
      snap("recent-movies", [
        item({ ratingKey: "2", title: "Gremlins" }),
        item({ ratingKey: "1", title: "Old" }),
      ]),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("new_movies");
    expect(events[0].payload.title).toContain("Gremlins");
    expect(events[0].payload.body).toBe("Movies");
    expect(events[0].payload.url).toContain("%2Flibrary%2Fmetadata%2F2");
  });

  it("does not re-fire for a ratingKey already seen", () => {
    const d = new NewMediaDetector();
    d.detect([snap("recent-movies", [item({ ratingKey: "1" })])]);
    d.detect([snap("recent-movies", [item({ ratingKey: "2" }), item({ ratingKey: "1" })])]);
    const third = d.detect([
      snap("recent-movies", [item({ ratingKey: "2" }), item({ ratingKey: "1" })]),
    ]);
    expect(third).toEqual([]);
  });

  it("keys strictly on ratingKey, not title (repeat titles allowed)", () => {
    const d = new NewMediaDetector();
    d.detect([snap("recent-movies", [item({ ratingKey: "1", title: "Dune" })])]);
    const events = d.detect([
      snap("recent-movies", [item({ ratingKey: "9", title: "Dune" })]),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].payload.url).toContain("%2Flibrary%2Fmetadata%2F9");
  });

  it("maps each section kind to its event type and label", () => {
    const d = new NewMediaDetector();
    // seed all four
    d.detect([
      snap("recent-movies", []),
      snap("recent-tv", []),
      snap("recent-anime-movies", []),
      snap("recent-anime-tv", []),
    ]);
    const events = d.detect([
      snap("recent-movies", [item({ ratingKey: "m", title: "A" })]),
      snap("recent-tv", [item({ ratingKey: "t", title: "B" })]),
      snap("recent-anime-movies", [item({ ratingKey: "am", title: "C" })]),
      snap("recent-anime-tv", [item({ ratingKey: "at", title: "D" })]),
    ]);
    const byType = Object.fromEntries(events.map((e) => [e.eventType, e.payload.body]));
    expect(byType).toEqual({
      new_movies: "Movies",
      new_tv: "TV Shows",
      new_anime_movies: "Anime Movies",
      new_anime_tv: "Anime TV Shows",
    });
  });

  it("ignores snapshot kinds that are not recent-media sections", () => {
    const d = new NewMediaDetector();
    const events = d.detect([{ kind: "governor", payload: { some: "thing" } }]);
    expect(events).toEqual([]);
  });

  it("tracks each kind independently (seeding one does not seed another)", () => {
    const d = new NewMediaDetector();
    d.detect([snap("recent-movies", [item({ ratingKey: "1" })])]); // seed movies only
    const events = d.detect([
      snap("recent-movies", [item({ ratingKey: "1" })]),
      snap("recent-tv", [item({ ratingKey: "t1" })]), // tv seen first time here → seed, no fire
    ]);
    expect(events).toEqual([]);
  });

  it("uses a plex app-root url when machineId is blank", () => {
    const d = new NewMediaDetector();
    d.detect([snap("recent-movies", [], "")]);
    const events = d.detect([snap("recent-movies", [item({ ratingKey: "5" })], "")]);
    expect(events[0].payload.url).toBe("https://app.plex.tv/desktop");
  });
});

describe("dispatchNewMedia", () => {
  it("calls sendPush once per new event with the mapped event type", async () => {
    const d = new NewMediaDetector();
    d.detect([snap("recent-movies", [])]); // seed
    const sendPush = vi.fn().mockResolvedValue(1);
    await dispatchNewMedia(
      d,
      [snap("recent-movies", [item({ ratingKey: "1", title: "X" })])],
      sendPush,
    );
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith("new_movies", expect.objectContaining({ body: "Movies" }));
  });

  it("continues dispatching when one sendPush rejects", async () => {
    const d = new NewMediaDetector();
    d.detect([snap("recent-movies", [])]); // seed
    const sendPush = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(1);
    await expect(
      dispatchNewMedia(
        d,
        [
          snap("recent-movies", [
            item({ ratingKey: "1", title: "X" }),
            item({ ratingKey: "2", title: "Y" }),
          ]),
        ],
        sendPush,
      ),
    ).resolves.toBeUndefined();
    expect(sendPush).toHaveBeenCalledTimes(2);
  });
});
