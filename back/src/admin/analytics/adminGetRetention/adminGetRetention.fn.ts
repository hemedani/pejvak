import { type ActFn } from "lesan";
import { pickByGet } from "@lib";
import { playbackSession, user } from "../../../../mod.ts";
import { clamp, startOfUtcWeek, WEEK_MS } from "../../time.ts";

/**
 * Weekly cohort retention.
 *
 * A cohort is the set of accounts created in one Monday-to-Sunday week; week N
 * of that cohort is "how many of those accounts listened at all during their
 * Nth week". Week 0 is therefore the signup week itself, which is why it is
 * near 100% and why it is a sanity check rather than a metric.
 *
 * The counting is done in JS over two small aggregations rather than in one
 * pipeline with `$lookup`. The join key is "week index relative to that
 * account's own signup", which Mongo cannot express without first joining every
 * session to its owner — and this way the shape of the calculation is readable,
 * which matters more here than the last millisecond of a report an operator
 * opens by hand.
 *
 * `distinct` matters: a listener who plays forty tracks in their second week is
 * one retained listener, not forty.
 */
export const adminGetRetentionFn: ActFn = async (body) => {
  const cohortCount = clamp(body.details.set.cohorts ?? 6, 1, 12);
  const weeks = clamp(body.details.set.weeks ?? 6, 1, 12);

  const currentWeekStart = startOfUtcWeek(Date.now());
  const firstCohortStart = currentWeekStart - (cohortCount - 1) * WEEK_MS;

  const [accounts, activity] = await Promise.all([
    user
      .aggregation({
        pipeline: [
          { $match: { createdAt: { $gte: new Date(firstCohortStart) } } },
          { $project: { _id: 1, createdAt: 1 } },
        ],
      })
      .toArray(),
    playbackSession
      .aggregation({
        pipeline: [
          { $match: { startedAt: { $gte: firstCohortStart } } },
          {
            $group: {
              _id: {
                user: "$user._id",
                week: {
                  $dateTrunc: {
                    unit: "week",
                    startOfWeek: "monday",
                    date: { $toDate: "$startedAt" },
                  },
                },
              },
            },
          },
        ],
      })
      .toArray(),
  ]);

  const cohortOf = new Map<string, number>();
  const sizeOf = new Map<number, number>();

  for (const account of accounts) {
    const createdAt = account.createdAt instanceof Date
      ? account.createdAt.getTime()
      : Number(account.createdAt ?? 0);
    const cohortStart = startOfUtcWeek(createdAt);

    cohortOf.set(String(account._id), cohortStart);
    sizeOf.set(cohortStart, (sizeOf.get(cohortStart) ?? 0) + 1);
  }

  // cohortStart -> weekIndex -> distinct user ids
  const activeByCohort = new Map<number, Map<number, Set<string>>>();

  for (const row of activity) {
    const userId = String(row._id?.user ?? "");
    const cohortStart = cohortOf.get(userId);
    if (cohortStart === undefined) continue;

    const weekStart = row._id?.week instanceof Date
      ? row._id.week.getTime()
      : new Date(row._id?.week).getTime();

    const weekIndex = Math.round((weekStart - cohortStart) / WEEK_MS);
    if (weekIndex < 0 || weekIndex >= weeks) continue;

    let byWeek = activeByCohort.get(cohortStart);
    if (!byWeek) {
      byWeek = new Map();
      activeByCohort.set(cohortStart, byWeek);
    }

    let listeners = byWeek.get(weekIndex);
    if (!listeners) {
      listeners = new Set();
      byWeek.set(weekIndex, listeners);
    }
    listeners.add(userId);
  }

  const cohorts = [];
  for (let index = 0; index < cohortCount; index += 1) {
    const cohortStart = firstCohortStart + index * WEEK_MS;
    const size = sizeOf.get(cohortStart) ?? 0;
    const byWeek = activeByCohort.get(cohortStart) ?? new Map();

    cohorts.push({
      cohortStart,
      cohortDate: new Date(cohortStart).toISOString().slice(0, 10),
      size,
      weeks: Array.from({ length: weeks }, (_, weekIndex) => {
        const activeUsers = byWeek.get(weekIndex)?.size ?? 0;
        return {
          week: weekIndex,
          activeUsers,
          rate: size > 0 ? Number((activeUsers / size).toFixed(4)) : 0,
        };
      }),
    });
  }

  return pickByGet({ cohorts, weeks }, body.details.get);
};
