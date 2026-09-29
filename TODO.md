# TODO — Online Audio (Discover)

Feature: play and download online audio from free language sources, with the full
Pejvak feature set (history, runs, stats, annotations) working for streamed audio.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked

---

## 0. Recon (done)

- [x] Read `AGENTS.md`, `mobile/AGENTS.md`, `back/AGENTS.md`, the design skill
      (`mobile/.agents/skills/appllama-app-design-skill`), `docs/`.
- [x] **`manahej.ir` exposes a real JSON API — no HTML scraping needed.**
      - WordPress 6.x + Elementor + **Sonaar Music Player** (`sr_playlist`).
      - Catalog: `GET /wp-json/wp/v2/categories?per_page=100` (id, name, slug, parent, count).
      - Playlist: `GET /?load=playlist.json&category=<id>&posts_per_pages=-1&single_playlist=1&srp_order=date_ASC`
        → `{ playlist_name, tracks: [{ mp3, track_title, album_title, poster, sourcePostID, ... }] }`
      - Audio lives on `https://dl.manahej.ir/podcast/...mp3?md5=…&expires=…`
        → **signed URLs that expire** (~3 months). Stored URLs go stale by design:
        the collection is re-resolved from the source before a (re)download.
      - `length: false` → no duration from the API. Duration comes from the player
        (`AudioStatus.duration`) and is written back to the row.
      - "رادیو مناهج" is the category with slug **`radio`**; its children are the
        shows (تاریخ شیعه · خلاصه کتاب · تاریخ انبیا · حال خوب · …). Looked up by
        slug, never by a hard-coded id.

## 1. Decisions (locked)

- [x] Content is fetched **by the mobile app** from the source's own JSON API.
      Our backend stores *addresses and user state*, never media bytes.
- [x] `ContextType` gains `"online"`; a streamed collection is a **run** like a
      folder or a playlist, so history/stats/annotations need no new machinery.
- [x] An online item is a **`tracks` row** with `origin = 'online'` and
      `file_uri = <stream url>`, so the existing player, sessions, stretches and
      stats all apply unchanged.
- [x] Online identity = `sha256("online:<sourceId>:<externalId>")` in
      `content_hash` (a real SHA-256, so the identity invariant still holds).
- [x] A downloaded course becomes a **real folder** (`folder_key`/`folder_name`),
      so it appears in the Library's Folders view and plays offline. The folder
      key is written **per file, on completion** — a course that was interrupted
      shows the lectures it got, not an empty folder.
- [x] `folder_key` is therefore **never set while streaming**: an online
      collection must not appear in the Library's folder list before anything
      has been downloaded. Per-track progress for a streamed collection is read
      from `collection_key` instead (`getCollectionTrackProgress`).
- [x] Download folder name = `Online/<source>/<sanitised title> (<externalId>)`.
      The id is part of the name, not decoration: two shows can share a title
      and would otherwise write `01 - …` over each other in one directory.

---

## 2. Mobile — foundation

- [x] `src/lib/online/types.ts` — language/source/collection/track + adapter contract
- [x] `src/lib/online/languages.ts` — language catalog (all languages; Persian enabled)
- [x] `src/lib/online/manahej.ts` — the manahej.ir adapter
- [x] `src/lib/online/archive.ts` — the Internet Archive adapter, one source per
      language, 46 of them (see §8)
- [x] `src/lib/online/transport.ts` + `text.ts` — the plumbing every adapter
      shares, extracted so a new adapter brings only its own mapping rules
- [x] `src/lib/online/naming.ts` — pure download naming
- [x] `src/lib/online/index.ts` — registry, keys, helpers
- [x] `src/lib/db/types.ts` — online track fields, `ContextType` `"online"`,
      `LocalOnlineCollection`, `DownloadJob`, inputs
- [x] `src/lib/db/migrations.ts` — **v11**: track columns, `online_collections`, `download_jobs`
- [x] `src/lib/db/mappers.ts` — map the new columns + the two new tables
- [x] `src/services/LocalDBService.ts` — upsert/read online tracks, collections, jobs,
      `getCollectionTrackProgress`
- [x] `src/lib/playbackContext.ts` — `"online"` type, label, `/online/[key]` route target

## 3. Mobile — services

- [x] `src/services/OnlineCatalogService.ts` — resolve adapter, fetch + map catalog,
      mint/lookup online track rows, favourites, saved list
- [x] `src/services/OnlineCollectionService.ts` — load → plan → play, the run's
      context, enqueue, and the delegated download/favourite verbs
- [x] `src/services/DownloadService.ts` — row-driven queue, sequential download,
      clean naming, folder materialisation, progress, resume, cancel, bounded retries

## 4. Mobile — playback integration

- [x] `TrackPlayerService` — online tracks stream from `file_uri`; never flagged
      `missing` on a network error; duration written back once known
- [x] `ContextService.resolveQueue` — an `"online"` branch, so History and the
      context-history sheet resume an online collection with no new code (and
      answer while offline, from the rows on the device)

## 5. Mobile — screens

- [x] `src/app/(tabs)/discover.tsx` — **Continue · Favorites · Browse**
      (one `FlatList`, a discriminated row union, a language search field)
- [x] `src/app/online/language/[code].tsx` — sources for a language
- [x] `src/app/online/source/[id].tsx` — a source's collections, with favourite
      and per-row download
- [x] `src/app/online/[key].tsx` — collection detail: artwork hero with completion,
      play/continue, shuffle, unfinished-only, add to queue, download control, tracks
- [x] Components: `online/collection-card`, `online/online-track-row`,
      `online/download-progress`, `online/language-row`
- [x] Hooks: `use-online-collection`, `use-online-collections`, `use-online-catalog`
- [x] Routes registered in `src/app/_layout.tsx`

## 6. Mobile — bottom bar rewrite

- [x] `src/components/app-tab-bar.tsx` — floating glass bar, 5 slots, raised
      circular Discover button in the centre
- [x] `src/components/app-tabs.tsx` + `(tabs)/_layout.tsx` — JS `Tabs` + custom
      `tabBar` (replaces `unstable-native-tabs`)
- [x] `src/theme/tokens.ts` — tab-bar geometry; mini-player clears the new bar
- [x] `src/components/ui/icon.tsx` — `compass`, `globe`, `bookmark`, `folderOpen`, …

## 7. Backend — the addresses, server-side

- [x] `models/onlineCollection.ts` — a user's saved/favourite online collection
- [x] `models/track.ts` — `origin`, `sourceId`, `externalId`, `collectionKey`,
      `collectionTitle`, `downloadedAt`
- [x] `src/online/` — `saveOnlineCollection`, `getMyOnlineCollections`,
      `removeOnlineCollection`
- [x] `registerTrack` accepts the online fields, and refreshes them on a row it
      already knows (a track streamed first and downloaded later)
- [x] `syncLocalData` gained an `onlineCollections` payload — idempotent per
      user, last-write-wins on `updatedAt`, tombstones honoured
- [x] Declarations regenerated and re-vendored: `back/declarations/selectInp.ts`
      and `mobile/src/lib/generated/selectInp.ts` are byte-identical again
- [x] Mobile pushes **and** pulls. `reconcileOnlineCollections` restores a saved
      shelf on a second device, and a local tombstone is never resurrected

### The blocker was wrong

Earlier notes recorded this section as blocked on a live MongoDB. It is not:
`mongod` is installed and **was already running on 27017** the whole time. The
declarations regenerate fine. The vendored mobile copy had simply gone stale
(18:49 vs 15:08 on Sep 21) — it was newer on acts and older on projections, so
the "byte-identical" invariant had quietly been false for a week.

### Decisions worth remembering

- **No `streamUrl` on the server, and no `downloadPath`.** Both are device-local:
  one expires, one is an absolute path that means nothing elsewhere. The durable
  address is `onlineCollection.pageUrl`.
- **No `downloadedAt` on the collection.** Whether the audio is on a device is
  already recorded per track, so a flag on the collection would be a second
  source of truth that could disagree with the tracks it summarises — the rule
  the project already applies to play counts.
- **`clientId` is `sourceId:externalId` and is deliberately *not* unique.** Two
  listeners who save the same public course share that key, so uniqueness is per
  user and lives in the act's lookup. The key is always **derived** from the
  source's own ids, never accepted from the client, so it can never disagree with
  the run's `contextKey`.
- **Opening a collection now dirties `sync_status`.** The earlier decision was to
  keep it local; it is reversed because `lastOpenedAt` is the field that makes
  Continue mean something on a second device, and a server column nothing ever
  writes is a smell.


## 8. A second source — the registry generalises

The request was to start with Persian, but the registry served exactly one
language, so every other language in the Browse list was a dead end the listener
was invited to tap. This section proves the adapter contract holds: a provider
costs one new file and one registry line, and nothing else.

- [x] `archive.ts` — the Internet Archive, **one source per language**
      (`archive-fa` … `archive-vi`). The registry line is a spread, not a
      roster: adding a language to the archive's own table is the whole of it.
- [x] `ADAPTER_BUILDERS` takes the **source**, not only its kind — one kind can
      serve many sources
- [x] `AVAILABLE_CODES` derived from the sources, with a test that fails if a
      source is registered for a language nobody marked available
- [x] `describeKnownTrackCount` — a browse card no longer prints "0 tracks" for a
      collection whose size is not known until it is opened

### Every language has content

Verified by query, not assumed: **all 46** of the catalogue's languages return
audio. Kazakh, the thinnest, has 24 items; English has 5.1 million.

### A language is not one facet value

The archive files an item under its English name *or* an ISO 639-2 code, and the
sets are **disjoint** — `Persian` 91, `fas` 9, `per` 2,094, union exactly 2,194.
A one-name query loses 96% of the content and hides the best of it: the
most-downloaded Persian item of all (`radioDaal`, 1.2M downloads) is filed
**only** under `per`. `ARCHIVE_LANGUAGES` lists every spelling and the query ORs
them. The browse query also carries `format:("mp3")` as a bare token, not the
label `VBR MP3` — 2,133 Persian items match the token against 2,125 for the
label, because some carry only a `128Kbps MP3` variant.

### Traps in the payload (all verified against the live API)

- **`length` mixes two units inside one item**: `"977.66"` (seconds) and
  `"20:45"` (`MM:SS`) side by side. `MM:SS` is **minutes** — across 213 colon
  values the largest first component is 109 and 27 exceed 59, so `"109:30"` is
  1 h 49 m. Reading it as `HH:MM:SS` overstates it sixtyfold.
- **`track` is inconsistently padded** (`"0000"`, `"003"`, `"5"`, `"10"`) and
  sometimes absent, so it is parsed numerically with the file's listing position
  as the fallback. As text, track 10 would sort before track 9.
- **`creator` / `title` / `language` may be a string *or* an array**, in one
  response.
- **A missing item answers `200` with `{}`** — no 404, so "no file list" is the
  not-found signal.
- **The extension decides what is playable, not the `format` label** — one
  Persian `.mp3` is labelled `Ogg Vorbis`.
- **The search index has no track count.** `files_count` counts every
  derivative (227 files for a 35-part course), so the size is reported unknown.
- Unlike manahej, **these stream URLs do not expire**: `/download/<id>/<name>` is
  a stable redirect.

### What it returns

The Persian list opens on Radio Daal, ملت عشق, گلستان, سمفونی مردگان, دنیای سوفی,
برتری خفیف, هزار و یکشب — real, well-known Persian audiobooks and podcasts, with
their authors in `creator`. `sort[]=downloads desc` is the closest thing the
archive has to an editorial selection, and it is the brief's own criterion.

## 9. Deleting a download — the way back out

The feature shipped without one. A listener could pull a 35-part course onto the
device and then had no way to reclaim the space: `startDownload`,
`cancelDownload`, `retryDownload` — and cancelling deliberately keeps what
arrived. Nothing ever deleted a download. This is §3's "delete download, keep
the row", and the row is the interesting half.

- [x] `LocalDBService.getDownloadedTrackPaths` / `forgetDownloadedTracks` /
      `deleteDownloadJobs`
- [x] `DownloadService.deleteDownload` — the mirror of `startDownload`
- [x] `DownloadService.whenIdle` — the worker can now be waited for, not only
      aborted
- [x] `finalizeCollection` no longer calls an empty queue a finished download
- [x] `use-online-collection` gains the verb; `DownloadControl` offers it in
      all four of its other states; the screen confirms first
- [x] `DownloadService.test.ts` — **24 tests**, 9 new

### The rule the design follows

Deleting the audio is not deleting the content. The row is what history,
statistics, annotations and resume positions hang off, and its identity is
`content_hash` — which downloading never changed. So the revert is the exact
inverse of `markTrackDownloaded`: `file_uri` returns to `stream_url` and the
row streams again, so a course finished last year keeps its finished count after
the space is reclaimed. `availability` goes back to `present`, **not**
`missing` — `missing` is the relink flag and there is nothing left to relink
to. `folder_key` is cleared with the bytes, so the folder leaves the Library's
Folders view in the same breath (that view is `WHERE folder_key IS NOT NULL`).

### The traps, and the order they force

- **The files are found from `download_path`, not from the title.** The folder
  is named after a title the source can edit upstream; a delete that rebuilt the
  path from today's title would remove nothing and leave every byte on disk
  forever. And it has to be read *before* the revert, which is what clears it.
- **`abort()` is not "the worker has stopped".** It asks the current file to
  give up; the promise being awaited has not settled. A file landing in that
  window writes a `downloaded_at` and a `file_uri` pointing at a file that is
  already deleted — a row that claims to be downloaded and plays nothing.
  `whenIdle()` resolves from the queue loop's own `finally`.
- **An empty queue is not a finished download.** `failed > 0 || done < total`
  is `0 < 0` — false — with no jobs, so it reported `complete`. Reachable with
  no race at all: the delete drops the queue and *then* records the state, so a
  process killed in between leaves `downloading` with zero jobs, which is
  exactly what `resumeInterruptedDownloads` picks up next launch.
- **A guard inside a loop has to terminate the loop.** The first version of that
  guard returned early, which killed the worker: `pump` stops only when the
  collection leaves `downloading`, so the same row was re-read forever. The
  test that found it ran out of heap. It now writes `none`.

### The tests were made to fail without the fix

Both race tests were re-run with their mechanism removed — `whenIdle` commented
out, and the guard deleted — and both failed. A passing test that would also pass
against the bug is not a test. That also required making the fakes faithful
first: `markTrackDownloaded` was a no-op, and a delete test asks what the rows
look like *afterwards*, where "unchanged" is also what a broken delete looks
like.

## 10. Downloads you can see

The download worked and was invisible. The only screen that rendered a download
state was the *source listing*, and its word-mapping was private to that file —
while Continue and Favorites, the two tabs the brief names by hand, read
`LocalOnlineCollection.downloadState` into a hook and then ignored it. A listener
could download a course and have no way to tell, from the tab that exists to list
what they kept, which of their courses was on the device.

- [x] `describeDownloadState` in `src/lib/online` — the words, shared
- [x] The source listing's `describeDownload` became `downloadGlyph`: the glyph
      and the accent stay with the component that draws them, the wording is
      shared, so the three call sites cannot drift into three vocabularies
- [x] `continueMeta` and a new `favoriteMeta` append it to the card's second line
- [x] `registry.test.ts` — 3 tests for the helper

### What it deliberately does not say

`none`, and no collection row at all, print nothing. A card for a collection that
was never downloaded must not add a line of noise to every one of the forty-six
languages' listings — and a *run* can outlive the collection row it came from, so
Continue has to tolerate a missing row rather than require one.

`downloading` claims no progress: a card in a list holds no job rows, and
querying them per row to render "3 of 12" is exactly the query-per-row the
catalogue hooks exist to avoid. The counts live on the collection screen, where
the listener is watching the download anyway.

### Item 4 was wrong — annotations already work on streamed audio

The next-session list recorded annotations on streamed audio as "a UI question,
not a data one". Checked, and they are **already done**: `useTrackAnnotations` is
keyed by track id alone, and the player's composer, markers and list have no gate
on `origin`, `folderKey` or a local file, because a streamed track is an ordinary
`tracks` row. Notes can be written, edited, deleted and synced on a streamed
course today. What does not exist is a *collection-level* notes surface outside
the player — and there is no global Notes screen for any content type, so that is
not an online-audio gap and is not claimed here.

## 11. A stream is not a file

Found by following the brief's own requirement — *"all the current features such
as history, analysis and statistics … must be available for online
broadcasting"* — one screen further than it was asked. The requirement **holds**:
`getSessionsForHistory` has no origin filter, so a streamed run counts in History
and in Stats exactly as a file does. What does not hold is the screen those
statistics link to.

- [x] `src/lib/audioLocation.ts` — `isStreamUri`, the one place that answers "is
      this a stream?" — in `lib/`, because `lib/` imports from `services/`
      **nowhere** (verified: 0 files) and both layers need the answer
- [x] `inspectAudioFile` refuses a stream **before the first read**, not after a
      failed one
- [x] `getTracksMissingArtwork` / `countTracksMissingArtwork` exclude `http(s)`
      locations in SQL
- [x] `backfillArtwork` counts `skipped` and deliberately does **not** stamp
- [x] `useAudioInspection` — "this streams" derived beside "the file is missing"
- [x] `buildFileFacts` — `Stream`, not `Location`; no longer "Imported file"
- [x] 2 new suites (`audioLocation`, `AudioInspectionService`), plus a test in
      each of `ArtworkService` and `trackFacts`

### The defect, link by link

`upsertOnlineTrack` writes the source's URL into `file_uri` — the same column a
local file's path lives in — and leaves `availability = 'present'`. So the
backfill's worklist, which asks only for `COALESCE(file_uri, source_uri) IS NOT
NULL`, handed every streamed row to `inspectAudioFile`, which called
`readAsStringAsync`, whose native implementation ends in
`else -> throw IOException("Unsupported scheme for location '$uri'.")`.

**Verified in the installed package, not assumed** —
`node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/legacy/FileSystemLegacyModule.kt:1052`,
where `getInputStream` handles `file`, `asset`, null-scheme and SAF and nothing
else; the legacy JS ships as `.d.ts` only, so the Kotlin is the contract. The
`catch` then left the row **unstamped** on purpose ("a later pass can try again"),
so every streamed track held a slot in **every** pass forever: the count never
reached zero, and each Library visit spent its limit on native calls that cannot
succeed.

### The fix is a filter, not a stamp — and that is the whole design

Stamping is the obvious way to empty the worklist, and it is wrong. A streamed
track becomes a real file the day it is downloaded, and a stamp records a verdict
about a file that does not exist — permanently denying the row the cover that
arrives with the bytes. Excluding it from the query keeps the worklist finite
**and** keeps the row a candidate for that day.

The same rule is therefore written twice: `isStreamUri` in TypeScript, and two
`NOT LIKE 'http…'` clauses in SQL, because a `LIKE` clause cannot call a
function. Both files name the other in a comment, so a change to one is a change
to two. The loop keeps its own guard as defence — a row can become a stream
between the query and the loop — and it too skips without stamping.

### The same assumption, twice more

`useAudioInspection` fed the same URL to the same reader, so `track/[id]` — the
screen Stats links to — showed the native `Unsupported scheme for location
'https://…?md5=…'` as its AUDIO note, where the truth is that the track lives
somewhere else. And `buildFileFacts` printed a signed, expiring URL under
**Location** and, because `source` is null for an online row,
`describeTrackSource`'s `default` branch described it as an **"Imported file"**.

Both are now derived rather than read. `streamed` sits beside `missing` in the
hook: both are properties of the row, so neither is state, neither writes state
from an effect (which `react-hooks/set-state-in-effect` forbids here), and neither
touches the filesystem. A streamed row must also not report `loading`, or the
spinner turns forever over a track that is working exactly as intended.

### A baseline failure that was a real bug

`trackFacts` has been one of four "documented baseline failures" for several
sessions without anyone asking what it was. It was asked, and it was a bug:
`buildTagFacts` printed `"Tag frames": "0"` for a file with **no tag at all**,
against the panel's own governing rule that a fact with no value is omitted —
`"Tag frames: 0"` beside no `Tag` row describes nothing. Guarded, and the suite
now passes, so the baseline is **three** suites, not four.

## 12. Verification

- [x] `npx tsc --noEmit` — clean
- [x] `npx eslint . --max-warnings=0` — baseline only (1 warning, in the
      generated, gitignored `.expo/types/router.d.ts`). `react-hooks/set-state-in-effect`
      did **not** fire on the new `useAudioInspection` branch, because `streamed`
      is derived rather than set from the effect — the same shape as `missing`.
- [x] `back/`: `deno check mod.ts`, `deno lint`, `deno fmt --check` — all clean
      (unchanged this session: no backend file was touched)
- [x] 5 new suites, 76 tests: `online/naming`, `online/registry`, `online/manahej`,
      `OnlineCollectionService`, `DownloadService`
- [x] `src/lib/online/archive.test.ts` — **32 tests**, at least one per payload
      trap (mixed `length` units, `MM:SS` past sixty, padded `track`, a
      string-or-array field, a mislabelled `.mp3`, an empty `{}` item response,
      the scrambled real item below, and the extension's own digit)
- [x] `registry.test.ts` — 22 tests; availability can no longer drift from the
      registry, a language with no bespoke adapter is no longer a dead end, and
      `describeDownloadState` names every state while claiming no progress it
      cannot know
- [x] `DownloadService.test.ts` — **24 tests**, 9 of them for the delete: the
      rows survive and rewind to streaming, the folder key goes, the recorded
      paths are removed, a file already gone does not stop the rest, the queue is
      dropped, a file in flight cannot re-mark a reverted row, and a delete the
      process died in the middle of is not resurrected as `complete`
- [x] Sync coverage: `reconcile` (22 tests, +6 for online collections),
      `syncEngine` (+2), `SyncService` (+2, push and pull)
- [x] **§11: `audioLocation.test.ts` (9 tests) + `AudioInspectionService.test.ts`
      (4 tests) — 2 new suites — plus one test each in `ArtworkService` and
      `trackFacts`.** The `AudioInspectionService` suite asserts on the *call*:
      `readAsStringAsync` must not have been invoked for a stream, because a
      version that attempted the read and then reported the failure would look
      correct from the outside while still spending the native call and still
      telling a retrying caller "not now" instead of "never".
- [x] **Every §11 mechanism was neutered to prove the tests mean something.**
      With `isStreamUri` reduced to `return false`: **4 suites failed, 7 tests
      failed** — `isStreamUri` ×3, `inspectAudioFile` ×2 (which then threw
      `Cannot read properties of undefined (reading 'replace')` from
      `decodeBase64`, i.e. proof the read was really attempted), `backfillArtwork`
      ×1 (`failed: 1, skipped: 0`), `buildFileFacts` ×1 (`Location` was the URL).
      Restored and `diff`-verified byte-identical.
- [x] Jest full run — **65 suites, 62 passed, 3 failed; 917 tests, 904 passed,
      13 failed.** The three failures are exactly the new baseline (`audioInfo`,
      `audioTags`, `embeddedArtwork`) — **`trackFacts` is fixed and passes**, so
      the baseline shrank rather than being carried. Against the previous run the
      numbers reconcile exactly: **+2 suites, +15 tests** (§11), **+16 passed**
      (the 15 new plus the recovered `trackFacts` test), **−1 failed**. All five
      `online` suites, `DownloadService`, `ArtworkService`, `AudioInspectionService`
      and `audioLocation` pass.
- [ ] Device pass: stream a collection, kill the app mid-stream, confirm the run
      recovers; download a course, confirm the folder + offline playback


### Trap found this session

- **The archive's `track` field cannot order an item — and the fixture did not
  notice.** The first ordering rule mixed a track number (1…102) with a raw file
  index (up to 657, inflated by the non-audio derivatives interleaved between the
  audio files) in a single key space. On the real `jadi-radio-geek`, where 92 of
  104 files carry no `track` at all, the episodes came out
  `1, 2, 3, 4 … 60, 7, 8, 9`. **Every unit test passed**, because the fixture I
  wrote to be awkward was still *self-consistent*: its padded track numbers
  happened to agree with its listing order. **A fixture you write shares your
  assumptions** — the mapping had to be run against the live endpoint to catch
  this. Ordering is now by the numbers in the file's own name, verified monotone
  across eight real items and six naming schemes.
- **`.expo/types/router.d.ts` is a generated file that goes stale silently.**
  It is gitignored and typed routes are checked against it, so a route that does
  not exist in it fails `tsc` — and, worse, a route added since it was last
  written fails too. It must be regenerated whenever a route is added:
  `npx expo start --offline` briefly (it is written during dev-server startup),
  then kill the server. Without it, `tsc` is not a meaningful gate at all.

---

## Next session — pick up here

1. **Device pass** (§12, the only unrun check): stream a collection, kill the app
   mid-stream and confirm the run recovers; download a course and confirm the
   folder appears in the Library and plays offline. This needs hardware.
2. ~~Add a second source to prove the registry generalises.~~ Done in §8: the
   Internet Archive covers all 46 languages, and a third source kind is now
   demonstrably a one-file change.
3. Downloads: parallel workers (currently sequential by design), and a global
   Downloads screen — "delete download, keep the row" is done in §9, and
   per-card download state in §10.
4. ~~Annotations on streamed audio.~~ Verified in §10: they already work. The
   player's composer has no gate on `origin`, and a streamed track is an ordinary
   `tracks` row. There is no *collection-level* notes surface outside the player,
   but there is no global Notes screen for any content type either, so it is not
   an online-audio gap.
5. The `onlineCollection` **pull** restores the shelf, but the *tracks inside* a
   restored collection are only fetched from the source when the listener opens
   it. Worth a browse-time prefetch so a restored shelf shows its lecture list
   before it is tapped.
6. ~~**Nothing from this feature is in git.**~~ **Resolved.** Committed as
   `7e34c62` (back, 20 files), `5a6c0fb` (mobile, 74 files) and `0138959` (docs,
   2 files); the working tree is clean.

   **The blocker recorded here was not real, and the correction matters.**
   `mobile/.gitignore:34` ignores `.env`, so `mobile/.env` was never stageable —
   `git check-ignore -v mobile/.env` names the rule, and a `git add -A -n` dry run
   listed 96 files with no secret among them. The missing `.easignore` is
   deliberate and correct: EAS then filters the upload by the `.gitignore` files
   it finds, which is exactly what keeps `.env`, `android/` and `ios/` off the
   build servers. Verified before committing: no hooks at all (`.git/hooks/` holds
   samples only, so a commit runs nothing), no deletions, and
   `back/declarations/selectInp.ts` still byte-identical to the vendored
   `mobile/src/lib/generated/selectInp.ts`.

   **Not pushed** — the branch is three ahead of `origin/main`, and pushing is the
   owner's call.

