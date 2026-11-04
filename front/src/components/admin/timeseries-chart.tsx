/**
 * Daily activity, one bar per UTC day.
 *
 * The backend fills empty days with zero, so a gap is drawn as a gap rather than
 * closed by a line. No charting library: this is a static server component, and
 * thirty divs cost less than a hydrated chart that would also need its axis
 * direction decided.
 */

import type { AdminTimeseries } from "@/lib/admin/domain/analytics";
import { formatNumber, formatSpan } from "@/lib/format";
import { formatDayHeading } from "@/lib/time";

export function TimeseriesChart({ series }: { series: AdminTimeseries }) {
  const peak = series.days.reduce(
    (highest, point) => Math.max(highest, point.sessions),
    0,
  );
  const totalSessions = series.days.reduce((sum, point) => sum + point.sessions, 0);
  const totalListen = series.days.reduce((sum, point) => sum + point.listenTimeSec, 0);
  const totalSignups = series.days.reduce((sum, point) => sum + point.signups, 0);
  const last = series.days[series.days.length - 1];

  return (
    <figure className="flex flex-col gap-[var(--space-md)]">
      <figcaption className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-4">
        <Figure label="Sessions" value={formatNumber(totalSessions)} />
        <Figure label="Listening" value={formatSpan(totalListen)} />
        <Figure label="Signups" value={formatNumber(totalSignups)} />
        <Figure label="Latest day" value={last ? formatNumber(last.activeUsers) : "—"} note="active listeners" />
      </figcaption>

      {series.days.length === 0 ? (
        <p className="type-caption py-[var(--space-xxl)] text-center text-text-tertiary">
          No activity has been recorded yet.
        </p>
      ) : (
        <div
          className="flex h-[180px] items-end gap-[3px]"
          role="img"
          aria-label={`Sessions over the last ${series.days.length} days, ${formatNumber(totalSessions)} in total`}
        >
          {series.days.map((point) => {
            const height = point.sessions > 0 && peak > 0
              ? Math.max(3, Math.round((point.sessions / peak) * 100))
              : 0;

            return (
              <div
                key={point.date}
                className="group relative flex-1 self-stretch"
                title={`${point.date} — ${formatNumber(point.sessions)} sessions, ${formatNumber(point.activeUsers)} listeners`}
              >
                <div className="absolute inset-x-0 bottom-0 flex h-full items-end">
                  <div
                    className={
                      height > 0
                        ? "w-full rounded-t-[var(--radius-xs)] bg-accent/70 transition-colors group-hover:bg-accent"
                        : "h-px w-full bg-[var(--outline-variant)]"
                    }
                    style={height > 0 ? { height: `${height}%` } : undefined}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-[var(--space-sm)]">
        <p className="type-caption text-text-tertiary">
          {series.days[0] ? formatDayHeading(series.days[0].timestamp) : ""}
        </p>
        <p className="type-caption text-text-tertiary">
          {last ? formatDayHeading(last.timestamp) : ""}
        </p>
      </div>
    </figure>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="type-overline text-text-tertiary">{label}</p>
      <p className="type-numeric mt-[var(--space-xxs)] text-text">{value}</p>
      {note ? <p className="type-caption text-text-tertiary">{note}</p> : null}
    </div>
  );
}
