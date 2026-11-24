import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { uploadChannelMediaFn } from "./uploadChannelMedia.fn.ts";
import { uploadChannelMediaValidator } from "./uploadChannelMedia.val.ts";

/**
 * The upload transport (plan §5, prompt D14).
 *
 * A normal Lesan act that takes `multipart/form-data`: the framework merges the
 * request's `FormData` into `details.set.formData`, this act streams the bytes
 * to `./uploads`, and `runServer({ staticPath: ["/uploads"] })` serves them back.
 * Auth is the same `token` header (`preAct`), so it is covered by `declarations`
 * exactly like every other act — no bespoke HTTP route.
 *
 * It is deliberately **separate** from `publishChannelAudio`: uploading bytes and
 * creating a DB row are two steps, so a half-finished publish never leaves a row
 * pointing at a file that was never written, and a retried upload is idempotent
 * against the quota rather than the catalogue.
 */
export const uploadChannelMediaSetup = () =>
  coreApp.acts.setAct({
    schema: "channelAudio",
    actName: "uploadChannelMedia",
    preAct: [setTokens, setUser, requireActive],
    validator: uploadChannelMediaValidator(),
    fn: uploadChannelMediaFn,
    validationRunType: "create",
  });
