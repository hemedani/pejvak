import { deleteAnnotationSetup } from "./deleteAnnotation/mod.ts";
import { getMyAnnotationsSetup } from "./getMyAnnotations/mod.ts";
import { updateAnnotationSetup } from "./updateAnnotation/mod.ts";

export const annotationsSetup = () => {
  updateAnnotationSetup();
  deleteAnnotationSetup();
  getMyAnnotationsSetup();
};
