import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminBackfillChannelWaveformsFn } from "./adminBackfillChannelWaveforms.fn.ts";
import { adminBackfillChannelWaveformsValidator } from "./adminBackfillChannelWaveforms.val.ts";

export const adminBackfillChannelWaveformsSetup = () =>
  coreApp.acts.setAct({
    schema: "channelAudio",
    actName: "adminBackfillChannelWaveforms",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminBackfillChannelWaveformsValidator(),
    fn: adminBackfillChannelWaveformsFn,
    validationRunType: "create",
  });
