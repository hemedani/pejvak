import { type ActFn } from "lesan";
import { pickByGet } from "@lib";
import { playbackSession, user } from "../../../../mod.ts";
import { clamp, DAY_MS, dayKey, startOfUtcDay } from "../../time.ts";

/**
 * One point per UTC day: signups, sessions, listening time, active listeners.
 *
 * The buckets are **filled in JS**, not by the database. An aggregation only
 * returns the days that have rows, and a chart that silently omits empty days
 * draws a line through a gap and reads as continuous activity. Every day in the
 * window is present, with zeros where nothing happened.
 *
 * Active listeners are counted per day, so one person listening twice is one,
 * and the same person on two days is two — that is what a daily series means.
 */
export const adminGetTimeseriesFn: ActFn = async (body) => {
  const days = clamp(body.details.set.days ?? 30, 7, 90);
  const todayStart = startOfUtcDay(Date.now());
  const since = todayStart - (days - 1) * DAY_MS;

  const [signups, activity] = await Promise.all([
    user
      .aggregation({
        pipeline: [
          { $match: { createdAt: { $gte: new Date(since) } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
        ],
      })
      .toArray(),
    playbackSession
      .aggregation({
        pipeline: [
          { $match: { startedAt: { $gte: since } } },
          {
            $group: {
              _id: {
                day: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: { $toDate: "$startedAt" },
                  },
                },
                user: "$user._id",
              },
              sessions: { $sum: 1 },
              listenTimeSec: { $sum: "$durationListenedSec" },
            },
          },
          {
            $group: {
              _id: "$_id.day",
              sessions: { $sum: "$sessions" },
              listenTimeSec: { $sum: "$listenTimeSec" },
              activeUsers: { $sum: 1 },
            },
          },
        ],
      })
      .toArray(),
  ]);

  const signupByDay = new Map(
    signups.map((row) => [String(row._id), Number(row.count ?? 0)]),
  );
  const activityByDay = new Map(
    activity.map((row) => [String(row._id), row]),
  );

  const points = [];
  for (let offset = 0; offset < days; offset += 1) {
    const timestamp = since + offset * DAY_MS;
    const key = dayKey(timestamp);
    const day = activityByDay.get(key);

    points.push({
      date: key,
      timestamp,
      signups: signupByDay.get(key) ?? 0,
      sessions: Number(day?.sessions ?? 0),
      listenTimeSec: Number(day?.listenTimeSec ?? 0),
      activeUsers: Number(day?.activeUsers ?? 0),
    });
  }

  return pickByGet(
    { days: points, from: since, to: todayStart + DAY_MS - 1 },
    body.details.get,
  );
};
