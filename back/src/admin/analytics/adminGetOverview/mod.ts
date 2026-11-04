import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminGetOverviewFn } from "./adminGetOverview.fn.ts";
import { adminGetOverviewValidator } from "./adminGetOverview.val.ts";

export const adminGetOverviewSetup = () =>
  coreApp.acts.setAct({
    // Analytics are aggregations over playback sessions, which is why the
    // schema is `playbackSession` and not a synthetic `admin` one. The clients
    // route on the pair (schema, act), and this mirrors `getMyStats`.
    schema: "playbackSession",
    actName: "adminGetOverview",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminGetOverviewValidator(),
    fn: adminGetOverviewFn,
  });
