import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { updateAnnotationFn } from "./updateAnnotation.fn.ts";
import { updateAnnotationValidator } from "./updateAnnotation.val.ts";

export const updateAnnotationSetup = () =>
  coreApp.acts.setAct({
    schema: "annotation",
    fn: updateAnnotationFn,
    actName: "updateAnnotation",
    preAct: [setTokens, setUser],
    validator: updateAnnotationValidator(),
  });
