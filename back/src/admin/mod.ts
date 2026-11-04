import { adminGrantAiCreditsSetup } from "./ai/adminGrantAiCredits/mod.ts";
import { adminGetOverviewSetup } from "./analytics/adminGetOverview/mod.ts";
import { adminGetRetentionSetup } from "./analytics/adminGetRetention/mod.ts";
import { adminGetTimeseriesSetup } from "./analytics/adminGetTimeseries/mod.ts";
import { adminGetTopTracksSetup } from "./analytics/adminGetTopTracks/mod.ts";
import { adminListAuditLogsSetup } from "./auditLog/adminListAuditLogs/mod.ts";
import { adminListPlansSetup } from "./plans/adminListPlans/mod.ts";
import { adminUpsertPlanSetup } from "./plans/adminUpsertPlan/mod.ts";
import { adminGetPlatformSettingSetup } from "./platform/adminGetPlatformSetting/mod.ts";
import { adminUpdatePlatformSettingSetup } from "./platform/adminUpdatePlatformSetting/mod.ts";
import { adminGrantSubscriptionSetup } from "./subscriptions/adminGrantSubscription/mod.ts";
import { adminListSubscriptionsSetup } from "./subscriptions/adminListSubscriptions/mod.ts";
import { adminRevokeSubscriptionSetup } from "./subscriptions/adminRevokeSubscription/mod.ts";
import { adminConfirmTransactionSetup } from "./transactions/adminConfirmTransaction/mod.ts";
import { adminListTransactionsSetup } from "./transactions/adminListTransactions/mod.ts";
import { adminRefundTransactionSetup } from "./transactions/adminRefundTransaction/mod.ts";
import { adminDeleteUserSetup } from "./users/adminDeleteUser/mod.ts";
import { adminGetUserSetup } from "./users/adminGetUser/mod.ts";
import { adminGetUserHistorySetup } from "./users/adminGetUserHistory/mod.ts";
import { adminListUsersSetup } from "./users/adminListUsers/mod.ts";
import { adminResetUserPasswordSetup } from "./users/adminResetUserPassword/mod.ts";
import { adminUpdateUserSetup } from "./users/adminUpdateUser/mod.ts";

/**
 * The admin panel's whole API surface.
 *
 * Grouped by the resource the act belongs to, not by a single `admin` schema:
 * Lesan routes on `(schema, act)`, and a synthetic schema would have to be a
 * model to exist. The mapping is therefore:
 *
 * - `user` — accounts and their history
 * - `playbackSession` — platform analytics (aggregations over sessions)
 * - `plan` — the catalogue
 * - `subscription` — grants and revokes
 * - `billingTransaction` — the ledger
 * - `adminAuditLog` — the activity feed
 * - `platformSetting` — the global switches
 * - `aiUsage` — AI credit grants
 *
 * Read acts use `requireSupport` (admin or support); mutating acts use
 * `requireAdmin`. That split is what makes a support role safe to hand out.
 */
export const adminSetup = () => {
  adminListUsersSetup();
  adminGetUserSetup();
  adminUpdateUserSetup();
  adminDeleteUserSetup();
  adminResetUserPasswordSetup();
  adminGetUserHistorySetup();

  adminGetOverviewSetup();
  adminGetTimeseriesSetup();
  adminGetTopTracksSetup();
  adminGetRetentionSetup();

  adminListPlansSetup();
  adminUpsertPlanSetup();

  adminGrantSubscriptionSetup();
  adminRevokeSubscriptionSetup();
  adminListSubscriptionsSetup();

  adminListTransactionsSetup();
  adminConfirmTransactionSetup();
  adminRefundTransactionSetup();

  adminListAuditLogsSetup();

  adminGetPlatformSettingSetup();
  adminUpdatePlatformSettingSetup();

  adminGrantAiCreditsSetup();
};
