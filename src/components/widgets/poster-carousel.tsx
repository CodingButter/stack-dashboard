"use client";

import { cn } from "@/lib/utils";
import type { RecentItem } from "@/lib/panels/schemas";

/**
 * A horizontally-scrolling row of Plex poster cards (Netflix/Plex-style). Art is
 * loaded through the session-gated /api/plex/art proxy so the Plex token never
 * reaches the browser. Cards deep-link to Plex web in a new tab; when the server
 * identity was unknown the card renders as a non-link (plexUrl === "").
 */
export function PosterCarousel({ items }: { items: RecentItem[] }) {
  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nothing added recently.
      </p>
    );
  }
  return (
    <div className="thin-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
      {items.map((it) => (
        <PosterCard key={it.ratingKey || it.title} item={it} />
      ))}
    </div>
  );
}

function PosterCard({ item }: { item: RecentItem }) {
  const inner = (
    <>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md border border-border bg-muted">
        {item.artUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- proxied Plex art, variable dims, not statically known
          <img
            src={item.artUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
            {item.title}
          </div>
        )}
        {item.episodeCount > 0 ? (
          <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
            {item.episodeCount} ep
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 w-full">
        <p className="truncate text-sm font-medium" title={item.title}>
          {item.title}
        </p>
        {item.year ? (
          <p className="text-xs text-muted-foreground">{item.year}</p>
        ) : null}
      </div>
    </>
  );

  const base = "w-32 shrink-0 snap-start sm:w-36";
  if (!item.plexUrl) {
    return <div className={base}>{inner}</div>;
  }
  return (
    <a
      href={item.plexUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        base,
        "group transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {inner}
    </a>
  );
}
