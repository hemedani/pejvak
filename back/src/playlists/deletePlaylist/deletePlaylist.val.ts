import { boolean, object, string } from "lesan";

export const deletePlaylistValidator = () =>
  object({
    set: object({
      playlistId: string(),
    }),
    get: object({
      success: boolean(),
    }),
  });
