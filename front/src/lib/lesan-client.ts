/**
 * The generated Lesan transport, behind one import site.
 *
 * `src/types/declarations/selectInp.ts` is a byte-for-byte copy of
 * `back/declarations/selectInp.ts` (plan §2 C6), guarded by
 * `scripts/check-declarations.mjs`. Nothing in the app imports it directly —
 * everything comes through here — so re-vendoring touches one file, and a
 * reviewer can see at a glance that the app depends on the generated contract
 * and nothing else.
 */

import type { ReqType } from "@/types/declarations/selectInp";

export { lesanApi } from "@/types/declarations/selectInp";
export type { ReqType } from "@/types/declarations/selectInp";

export type BackendRequest = ReqType;
export type BackendService = keyof BackendRequest;
export type BackendModel<TService extends BackendService> = keyof BackendRequest[TService];
export type BackendAct<
  TService extends BackendService,
  TModel extends keyof BackendRequest[TService],
> = keyof BackendRequest[TService][TModel];

/** One act, fully narrowed: model, verb, and the exact `{ set, get }` it accepts. */
export type BackendActRequest<
  TService extends BackendService,
  TModel extends keyof BackendRequest[TService],
  TAct extends keyof BackendRequest[TService][TModel],
> = {
  service?: TService;
  model: TModel;
  act: TAct;
  details: BackendRequest[TService][TModel][TAct];
};

/**
 * The response body for an act, derived from the projection that was sent.
 *
 * `get` is a projection of `0 | 1` leaves, so the response mirrors it: every
 * field the projection asked for is present, everything else is absent. Rather
 * than hand-writing a response type per act — a second source of truth that
 * drifts the moment the backend adds a field — callers narrow the result at the
 * boundary with a parser. See `actions/` for the pattern.
 */
export type ActResponse = Record<string, unknown>;
