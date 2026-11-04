import { coreApp } from "../mod.ts";
import { defaulted, enums, number, optional, string } from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";

/**
 * One attempt to pay for one plan.
 *
 * Deliberately **not** related to `User`. A receipt is a financial record: it
 * has to outlive the account it belongs to, both for reconciliation with the
 * payment provider and for tax. A Lesan relation would cascade-delete these
 * rows when an admin deletes a listener, so the owner is stored as a plain
 * `userId` string plus an email snapshot instead. That also keeps the user
 * document from growing a reverse array of every payment ever made.
 *
 * `reference` is ours (`txn_<uuid>`), created before the provider is contacted,
 * and it is what makes the flow idempotent: the same reference can be confirmed
 * twice (a double click, a retried callback) and only the first marks it paid.
 *
 * Amounts are integer minor units with a currency snapshot — never a float, and
 * never re-read from the plan, so a later price change cannot rewrite history.
 */
export const billingTransaction_pure = {
  /** `txn_<uuid>`; unique, and the idempotency key of the whole flow. */
  reference: string(),
  /** The owner as a string — see the note above about not using a relation. */
  userId: string(),
  userEmail: optional(string()),
  planCode: string(),
  /** Captured at purchase time so a receipt survives a rename. */
  planTitle: optional(string()),
  amountCents: number(),
  currency: defaulted(string(), "USD"),
  billingInterval: defaulted(string(), "month"),
  status: defaulted(
    enums(["pending", "paid", "failed", "refunded", "canceled"]),
    "pending",
  ),
  /** `manual` (admin-confirmed) or a provider name such as `stripe`. */
  provider: defaulted(string(), "manual"),
  providerRef: optional(string()),
  /** The paid window this transaction bought, filled in when it completes. */
  periodStart: optional(number()),
  periodEnd: optional(number()),
  /** Admin-only free text ("bank transfer #1234"). */
  note: optional(string()),
  /** JSON string; provider payloads kept verbatim for dispute handling. */
  metadata: optional(string()),
  paidAt: optional(number()),
  refundedAt: optional(number()),
  ...createUpdateAt,
};

export const billingTransaction_relations = {};

export const billingTransactions = () =>
  coreApp.odm.newModel(
    "billingTransaction",
    billingTransaction_pure,
    billingTransaction_relations,
    {
      createIndex: {
        indexSpec: { reference: 1 },
        options: { unique: true },
      },
    },
  );
