import { enums, object, optional } from "lesan";

/**
 * The settings act's projection deliberately does not use `selectStruct`:
 * returning the whole user from a settings read would expose account fields.
 */
export const settingProjection = () =>
  object({
    languageCode: optional(enums([0, 1])),
    defaultSpeed: optional(enums([0, 1])),
    historySort: optional(enums([0, 1])),
    updatedAt: optional(enums([0, 1])),
  });
