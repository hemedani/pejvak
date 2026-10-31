import Link from "next/link";
import { notFound } from "next/navigation";

import { getMyPlaylistDetail } from "@/app/actions/playlists/get-my-playlist";
import { PlaylistEditor } from "@/components/domain/playlist-editor";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ErrorState } from "@/components/ui/state";

export const metadata = { title: "Playlist" };

/**
 * One playlist.
 *
 * ## A missing playlist is the app's 404
 *
 * The read answers `null` for an id that does not exist, for one that belongs to
 * somebody else, and for a string that is not an ObjectId at all — the act is
 * scoped to the signed-in user, so those three are one fact from here. All three
 * `notFound()`, which means the page uses the one 404 design instead of growing
 * a second one.
 *
 * ## The title is static
 *
 * `generateMetadata` would need a second read of the same playlist for a tab
 * title, and a Server Action is not cached between the page and its metadata.
 * "Playlist" is enough; the heading on the page says the rest.
 *
 * ## Everything interactive is one client component
 *
 * The editor needs the playlist, its resolved entries and the library together —
 * rename, reorder, add and delete all write the same array. Splitting that across
 * three client leaves would mean three copies of the same `pending` flag and
 * three ways to start a second concurrent write.
 */
export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getMyPlaylistDetail(id);

  if (!result.success) {
    return (
      <div className="flex flex-col gap-[var(--space-lg)]">
        <BackLink />
        <Card>
          <ErrorState failure={result.error} retryHref={`/playlists/${id}`} />
        </Card>
      </div>
    );
  }

  if (result.body === null) {
    notFound();
  }

  const { playlist, entries, library } = result.body;

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <BackLink />
      <PlaylistEditor playlist={playlist} entries={entries} library={library} />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/playlists"
      className="type-caption inline-flex w-fit items-center gap-[var(--space-xs)] text-text-tertiary transition-colors hover:text-text"
    >
      <Icon name="start" size="xs" />
      Playlists
    </Link>
  );
}
