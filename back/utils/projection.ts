import type { Document } from "lesan";
import { coreApp } from "../mod.ts";

/**
 * A client may send `get: {}` to mean "no projection". Mongo rejects an empty
 * `$project` in an aggregation, so fall back to every safe pure field instead
 * of failing the request. A non-empty projection is passed through untouched.
 */
export const projectionOrPure = (
  get: Document | undefined,
  schema: string,
): Document =>
  get && Object.keys(get).length > 0
    ? get
    : coreApp.schemas.createProjection(schema, "Pure");
