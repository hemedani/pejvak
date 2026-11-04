import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminListAuditLogsFn } from "./adminListAuditLogs.fn.ts";
import { adminListAuditLogsValidator } from "./adminListAuditLogs.val.ts";

export const adminListAuditLogsSetup = () =>
  coreApp.acts.setAct({
    schema: "adminAuditLog",
    actName: "adminListAuditLogs",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminListAuditLogsValidator(),
    fn: adminListAuditLogsFn,
  });
