import {
  enums,
  nullable,
  number,
  object,
  optional,
  refine,
  size,
  string,
} from "lesan";
import { settingProjection } from "../projection.ts";

export const updateMySettingsValidator = () =>
  object({
    set: object({
      languageCode: optional(nullable(size(string(), 0, 16))),
      defaultSpeed: optional(
        refine(
          number(),
          "defaultSpeed between 0.5 and 3.0",
          (value) => value >= 0.5 && value <= 3,
        ),
      ),
      historySort: optional(enums(["newest", "oldest", "longest"])),
      updatedAt: optional(number()),
    }),
    get: settingProjection(),
  });
