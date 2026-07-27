import { KpiCard } from "@/components/widgets/kpi-card";
import type { RecentStats, StatCard } from "@/lib/panels/schemas";

/**
 * Four count cards above the Recently Added carousels. The trend badge is shown
 * only when `trendPct` is non-null (the assembler hides it when the trend is
 * meaningless — see buildRecentStats); otherwise the card is count-only.
 * "Recent Items" is the count in the capped recent window, not a library total.
 */
export function StatCards({ stats }: { stats: RecentStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card label="New Movies" card={stats.newMovies} />
      <Card label="New Shows" card={stats.newShows} />
      <Card label="Anime Added" card={stats.animeAdded} />
      <Card label="Recent Items" card={stats.recentItems} />
    </div>
  );
}

function Card({ label, card }: { label: string; card: StatCard }) {
  const trend = card.trendPct;
  const delta =
    trend != null ? `${trend > 0 ? "+" : ""}${trend}%` : undefined;
  const direction =
    trend == null ? "flat" : trend > 0 ? "up" : trend < 0 ? "down" : "flat";

  return (
    <KpiCard
      label={label}
      value={card.count}
      delta={delta}
      deltaDirection={direction}
    />
  );
}
