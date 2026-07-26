"use client";

import { PanelCard } from "@/components/widgets/panel-card";
import { PosterCarousel } from "@/components/widgets/poster-carousel";
import type { RecentlyAdded } from "@/lib/panels/schemas";
import { usePanelData } from "./use-panel-data";

/**
 * Recently Added — one horizontally-scrolling poster carousel per Plex library
 * section (Movies, TV, Anime Movies, Anime TV). Series appear at the series
 * level with an episode-count badge and bubble to the front when a new episode
 * lands. Polls on the default (slow) interval; the underlying poller is a 5-min
 * tier, so nothing is gained by hammering it.
 */
export function RecentlyAddedPanel() {
  const { data, error } = usePanelData<RecentlyAdded>(
    "/api/panels/recently-added",
  );

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-base text-muted-foreground">
        {error ? `Failed to load: ${error}` : "Loading recently added…"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.sections.map((section) => (
        <PanelCard key={section.kind} title={section.title} subsystem="plex">
          <PosterCarousel items={section.items} />
        </PanelCard>
      ))}
    </div>
  );
}
