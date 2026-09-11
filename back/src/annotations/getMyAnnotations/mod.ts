import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getMyAnnotationsFn } from "./getMyAnnotations.fn.ts";
import { getMyAnnotationsValidator } from "./getMyAnnotations.val.ts";

export const getMyAnnotationsSetup = () =>
  coreApp.acts.setAct({
    schema: "annotation",
    fn: getMyAnnotationsFn,
    actName: "getMyAnnotations",
    preAct: [setTokens, setUser],
    validator: getMyAnnotationsValidator(),
  });
