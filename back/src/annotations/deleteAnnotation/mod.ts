import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { deleteAnnotationFn } from "./deleteAnnotation.fn.ts";
import { deleteAnnotationValidator } from "./deleteAnnotation.val.ts";

export const deleteAnnotationSetup = () =>
  coreApp.acts.setAct({
    schema: "annotation",
    fn: deleteAnnotationFn,
    actName: "deleteAnnotation",
    preAct: [setTokens, setUser],
    validator: deleteAnnotationValidator(),
  });
