import { coreApp } from "../../../mod.ts";
import { createFirstAdminFn } from "./createFirstAdmin.fn.ts";
import { createFirstAdminValidator } from "./createFirstAdmin.val.ts";

/**
 * Public, one-time bootstrap: creates the first admin **only while no admin
 * exists**.
 *
 * `deno task seed` remains the normal path for a fresh deployment. This act
 * exists for a deployment that wants its first admin created through the API
 * instead of a shell, and it is self-disabling: the first admin closes it. It is
 * a setup tool, not a way to promote an existing listener — never ship it as a
 * client feature.
 */
export const createFirstAdminSetup = () =>
  coreApp.acts.setAct({
    schema: "user",
    actName: "createFirstAdmin",
    validator: createFirstAdminValidator(),
    fn: createFirstAdminFn,
    validationRunType: "create",
  });
