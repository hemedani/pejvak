/**
 * The admin wire boundary.
 *
 * These parsers are the only place an operator screen sees a backend shape.
 * Two rules are worth locking:
 *
 *   · **A missing role/status fails closed** — legacy accounts read as
 *     `user`/`active`, never as an operator.
 *   · **A value the backend omitted is `null`, not `0`** — a `null` renders as
 *     an em dash, while `0` is a fact the panel would be inventing.
 */

import { describe, expect, it } from "vitest";

import { pageCount, parsePaged } from "../admin/domain/common";
import { parsePlan } from "../admin/domain/plans";
import { parseSubscription, sortSubscriptionsForDisplay } from "../admin/domain/subscriptions";
import { parseAuditLog, metadataEntries } from "../admin/domain/audit";
import { parsePlatformSetting } from "../admin/domain/platform";
import { parseOverview } from "../admin/domain/analytics";
import {
  parseUserDetail,
  parseUserHistoryRow,
  parseUserRow,
} from "../admin/domain/users";
import { formatLimit, formatMoney, formatRate } from "../admin/format";

const objectId = "6512a1f4c2b3d4e5f6a7b8c9";

describe("parsePaged", () => {
  it("keeps the server's wrapper and drops rows it cannot identify", () => {
    const paged = parsePaged(
      {
        rows: [{ _id: objectId, code: "pro" }, { code: "broken" }],
        total: 41,
        page: 2,
        limit: 25,
      },
      parsePlan,
    );

    expect(paged.total).toBe(41);
    expect(paged.page).toBe(2);
    expect(paged.limit).toBe(25);
    expect(paged.rows.map((row) => row.code)).toEqual(["pro"]);
  });

  it("treats a non-record payload as an empty page", () => {
    expect(parsePaged(null, parsePlan)).toEqual({ rows: [], total: 0, page: 1, limit: 0 });
  });

  it("computes page count without inventing a page past the end", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(1, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(50, 25)).toBe(2);
  });
});

describe("parseUserRow", () => {
  it("keeps a normalised role and status", () => {
    const row = parseUserRow({
      _id: objectId,
      username: "support",
      email: "support@pejvak.app",
      role: "support",
      status: "suspended",
      planCode: "pro",
      subscription: { planCode: "pro", status: "active", currentPeriodEnd: 1_800_000_000_000 },
      usage: { sessionCount: 12, listenTimeSec: 3600, lastActiveAt: 1_700_000_000_000 },
    });

    expect(row?.role).toBe("support");
    expect(row?.status).toBe("suspended");
    expect(row?.planCode).toBe("pro");
    expect(row?.usage.sessionCount).toBe(12);
  });

  it("fails closed for a legacy account with no role or status", () => {
    const row = parseUserRow({ _id: objectId, username: "legacy", email: "legacy@pejvak.app" });

    expect(row?.role).toBe("user");
    expect(row?.status).toBe("active");
  });
});

describe("parseUserDetail", () => {
  it("reads entitlement, quota and a recent session", () => {
    const detail = parseUserDetail({
      user: { _id: objectId, username: "listener", email: "listener@pejvak.app" },
      entitlement: {
        planCode: "pro",
        planTitle: "Pro",
        isPaid: true,
        limits: {
          historyEntries: -1,
          crossDeviceSync: true,
          playlists: -1,
          maxTracks: -1,
          aiCreditsPerMonth: 100,
        },
        subscriptionStatus: "active",
        currentPeriodEnd: 1_800_000_000_000,
        cancelAtPeriodEnd: false,
        autoRenew: true,
      },
      historyQuota: { limit: -1, used: 800, remaining: -1, unlimited: true },
      usage: { sessionCount: 800, listenTimeSec: 90_000 },
      recentSessions: [
        { _id: "s1", contentHash: "hash", startedAt: 1, durationListenedSec: 60, track: { title: "Chapter 1" } },
      ],
    });

    expect(detail?.entitlement?.limits.historyEntries).toBe(-1);
    expect(detail?.historyQuota?.unlimited).toBe(true);
    expect(detail?.recentSessions[0]?.trackTitle).toBe("Chapter 1");
    expect(detail?.recentSessions[0]?.deviceInfo).toBeNull();
  });
});

describe("parseUserHistoryRow", () => {
  it("collapses the embedded track title and never promises deviceInfo", () => {
    const row = parseUserHistoryRow({
      _id: "s1",
      contentHash: "hash",
      startedAt: 1_700_000_000_000,
      durationListenedSec: 90,
      track: { title: "Chapter 2" },
    });

    expect(row?.trackTitle).toBe("Chapter 2");
    expect(row?.deviceInfo).toBeNull();
  });
});

describe("parsePlan", () => {
  it("keeps -1 limits and subscriber counts as returned", () => {
    const plan = parsePlan({
      _id: objectId,
      code: "pro",
      title: "Pro",
      priceCents: 399,
      currency: "USD",
      billingInterval: "month",
      isActive: true,
      isDefault: false,
      limits: { historyEntries: -1, crossDeviceSync: true, playlists: -1, maxTracks: -1, aiCreditsPerMonth: 100 },
      features: ["Unlimited history"],
      subscribers: 7,
    });

    expect(plan?.limits.historyEntries).toBe(-1);
    expect(plan?.subscribers).toBe(7);
  });
});

describe("parseSubscription", () => {
  it("reads the account summary and leaves lifetime rows with no end", () => {
    const row = parseSubscription({
      _id: objectId,
      planCode: "pro",
      status: "active",
      provider: "manual",
      autoRenew: false,
      user: { _id: "u1", email: "listener@pejvak.app", username: "listener" },
    });

    expect(row?.currentPeriodEnd).toBeNull();
    expect(row?.user?.email).toBe("listener@pejvak.app");
    expect(row?.autoRenew).toBe(false);
  });

  it("sorts lifetime rows last instead of trusting the backend sort", () => {
    const ended = parseSubscription({ _id: "a", planCode: "pro", status: "active", currentPeriodEnd: 20 });
    const earlier = parseSubscription({ _id: "b", planCode: "pro", status: "active", currentPeriodEnd: 10 });
    const forever = parseSubscription({ _id: "c", planCode: "pro", status: "active" });

    const sorted = sortSubscriptionsForDisplay([forever!, ended!, earlier!]);

    expect(sorted.map((row) => row.id)).toEqual(["b", "a", "c"]);
  });
});

describe("audit metadata", () => {
  it("parses a JSON string into display entries", () => {
    const row = parseAuditLog({
      _id: objectId,
      action: "user.update",
      actorEmail: "admin@pejvak.app",
      metadata: JSON.stringify({ changes: { role: { from: "user", to: "admin" } }, note: null }),
    });

    expect(row?.action).toBe("user.update");
    expect(metadataEntries(row!.metadata)).toEqual([
      { key: "changes", value: JSON.stringify({ role: { from: "user", to: "admin" } }) },
    ]);
  });

  it("does not break an old row with malformed metadata", () => {
    expect(metadataEntries("{not json")).toEqual([]);
    expect(metadataEntries(null)).toEqual([]);
  });
});

describe("parsePlatformSetting", () => {
  it("turns a blank announcement into null", () => {
    expect(
      parsePlatformSetting({
        key: "platform",
        signupsEnabled: true,
        aiEnabled: false,
        maintenanceMode: false,
        announcement: "   ",
      })?.announcement,
    ).toBeNull();
  });
});

describe("parseOverview", () => {
  it("keeps the server's revenue and quota figures", () => {
    const overview = parseOverview({
      generatedAt: 1,
      users: { total: 100, active: 90, suspended: 2 },
      activity: { activeLast24h: 10 },
      content: { sessions: 1000 },
      revenue: {
        mrrCents: 39900,
        currency: "USD",
        payingUsers: 100,
        arpuCents: 399,
        conversionRate: 0.25,
        planDistribution: [{ planCode: "pro", title: "Pro", priceCents: 399, isActive: true, users: 100 }],
      },
      quota: { freeHistoryLimit: 500, usersAtLimit: 42 },
    });

    expect(overview?.revenue.conversionRate).toBe(0.25);
    expect(overview?.quota.usersAtLimit).toBe(42);
    expect(overview?.revenue.planDistribution[0]?.users).toBe(100);
  });
});

describe("admin formatting", () => {
  it("renders -1 as Unlimited, never as a negative number", () => {
    expect(formatLimit(-1)).toBe("Unlimited");
    expect(formatLimit(500)).toBe("500");
  });

  it("formats money with the plan's own currency", () => {
    expect(formatMoney(399, "USD")).toBe("$3.99");
    expect(formatMoney(399, "EUR")).toBe("€3.99");
  });

  it("keeps two decimals on a rate so 0.25% is not shown as 0%", () => {
    expect(formatRate(0.0025)).toBe("0.25%");
    expect(formatRate(0.25)).toBe("25.00%");
  });
});
