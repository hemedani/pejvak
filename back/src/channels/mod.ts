import { createChannelPlaylistSetup } from "./createChannelPlaylist/mod.ts";
import { createChannelSetup } from "./createChannel/mod.ts";
import { deleteChannelAudioSetup } from "./deleteChannelAudio/mod.ts";
import { deleteChannelPlaylistSetup } from "./deleteChannelPlaylist/mod.ts";
import { deleteChannelSetup } from "./deleteChannel/mod.ts";
import { getChannelAudioSetup } from "./getChannelAudio/mod.ts";
import { getChannelSetup } from "./getChannel/mod.ts";
import { getMyChannelsSetup } from "./getMyChannels/mod.ts";
import { getMySubscribedChannelsSetup } from "./getMySubscribedChannels/mod.ts";
import { listChannelAudiosSetup } from "./listChannelAudios/mod.ts";
import { listChannelPlaylistsSetup } from "./listChannelPlaylists/mod.ts";
import { listChannelSubscribersSetup } from "./listChannelSubscribers/mod.ts";
import { listChannelsSetup } from "./listChannels/mod.ts";
import { moveChannelAudioSetup } from "./moveChannelAudio/mod.ts";
import { publishChannelAudioSetup } from "./publishChannelAudio/mod.ts";
import { subscribeChannelSetup } from "./subscribeChannel/mod.ts";
import { unsubscribeChannelSetup } from "./unsubscribeChannel/mod.ts";
import { updateChannelAudioSetup } from "./updateChannelAudio/mod.ts";
import { updateChannelPlaylistSetup } from "./updateChannelPlaylist/mod.ts";
import { updateChannelSetup } from "./updateChannel/mod.ts";
import { uploadChannelMediaSetup } from "./uploadChannelMedia/mod.ts";

/**
 * The Listener Channels domain (plan §4).
 *
 * **One route per operation, role-aware inside it (prompt D15)** — there is no
 * parallel `admin*` act. The validator carries data validity; the tenant boundary
 * and the moderation business rules are enforced in the act via `src/channels/authz.ts`:
 *
 * - **Creator acts** (`preAct:[setTokens,setUser,requireActive]`) — channel and
 *   folder CRUD, the multipart upload, and the audio publish/update/move/delete.
 *   A creator is scoped to their own `owner._id` (the child models keep
 *   `user._id`) and cannot flip `status`.
 * - **Listener acts** — `subscribeChannel`/`unsubscribeChannel`
 *   (`requireActive`) and `getMySubscribedChannels`; `listChannelSubscribers`
 *   is the owner's (and an operator's) read of who follows.
 * - **Public browse** (`preAct:[optionalAuth]`) — `listChannels`, `getChannel`,
 *   `listChannelPlaylists`, `listChannelAudios`, `getChannelAudio`. Anonymous and
 *   creator callers are pinned to `status:"active"`; an operator who presents a
 *   token sees `removed` rows through the *same* act.
 * - **Operator powers** live inside `updateChannel`/`deleteChannel`/
 *   `deleteChannelAudio` (cross-tenant scope + `status` + `recordAudit`), gated on
 *   `roleOf(user) === "admin"` — not on a separate endpoint.
 */
export const channelsSetup = () => {
  // Creator — channels
  createChannelSetup();
  updateChannelSetup();
  deleteChannelSetup();
  getMyChannelsSetup();

  // Creator — folders
  createChannelPlaylistSetup();
  updateChannelPlaylistSetup();
  deleteChannelPlaylistSetup();

  // Listener — subscriptions
  subscribeChannelSetup();
  unsubscribeChannelSetup();
  getMySubscribedChannelsSetup();
  listChannelSubscribersSetup();

  // Creator — media upload + episodes
  uploadChannelMediaSetup();
  publishChannelAudioSetup();
  updateChannelAudioSetup();
  moveChannelAudioSetup();
  deleteChannelAudioSetup();

  // Public browse
  listChannelsSetup();
  getChannelSetup();
  listChannelPlaylistsSetup();
  listChannelAudiosSetup();
  getChannelAudioSetup();
};
