/**
 * A source's catalogue, plus what the listener has already decided about it.
 *
 * The Browse list asks two questions at once: "what does this source have?" —
 * which is a network question with a five-minute memo — and "which of these did
 * I keep?" — which is a local one. Answering them together is what lets a card
 * show a filled bookmark and a "Downloaded" line without a query per row.
 *
 * Downloading from a list is the case worth spelling out: the tracks are not on
 * the device yet, because the listener has never opened the collection. So the
 * download path *loads* the collection first (which is what writes its rows),
 * and only then queues it. Doing it the other way round would queue a
 * collection with nothing in it and fail with a message about the network.
 *
 * The result is keyed by source id rather than guarded by a ref, following
 * `useFolderDetail` — a late catalogue for a source the screen has left is
 * simply not the current key, so it is never painted.
 */

import { useCallback, useEffect, useState } from "react";

import type { LocalOnlineCollection } from "@/lib/db/types";
import { OnlineSourceError, type OnlineCollection } from "@/lib/online";
import * as DownloadService from "@/services/DownloadService";
import { LocalDBService } from "@/services/LocalDBService";
import { OnlineCatalogService } from "@/services/OnlineCatalogService";

/** Shared so an empty result does not hand out new objects every render. */
const EMPTY_COLLECTIONS: OnlineCollection[] = [];
const EMPTY_SAVED: Record<string, LocalOnlineCollection> = {};

/** Everything a catalogue read produces, tagged with the source it is about. */
type Loaded = {
  sourceId: string;
  collections: OnlineCollection[];
  saved: Record<string, LocalOnlineCollection>;
  error: string | null;
};

export type UseOnlineCatalogResult = {
  collections: OnlineCollection[];
  /** The local row for each collection the listener has saved, by key. */
  saved: Record<string, LocalOnlineCollection>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: (options?: { refresh?: boolean }) => Promise<void>;
  toggleFavorite: (collection: OnlineCollection) => Promise<void>;
  download: (collection: OnlineCollection) => Promise<void>;
};

function messageOf(error: unknown): string {
  if (error instanceof OnlineSourceError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** What the listener has already saved, favourited or downloaded. */
async function readSaved(): Promise<Record<string, LocalOnlineCollection>> {
  const rows = await LocalDBService.getOnlineCollections();
  const byKey: Record<string, LocalOnlineCollection> = {};
  for (const row of rows) {
    byKey[row.key] = row;
  }
  return byKey;
}

async function loadFor(sourceId: string, force: boolean): Promise<Loaded> {
  try {
    const [collections, saved] = await Promise.all([
      OnlineCatalogService.listCollections(sourceId, { refresh: force }),
      readSaved(),
    ]);
    return { sourceId, collections, saved, error: null };
  } catch (caught) {
    return {
      sourceId,
      collections: EMPTY_COLLECTIONS,
      saved: await readSaved(),
      error: messageOf(caught),
    };
  }
}

export function useOnlineCatalog(sourceId: string | null): UseOnlineCatalogResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** A failed action — a download that would not start — as opposed to a read. */
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceId) {
      return;
    }
    let cancelled = false;
    void loadFor(sourceId, false).then((next) => {
      if (!cancelled) {
        setLoaded(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  // A download started from this list keeps running after the screen closes, so
  // the rows are re-read from the notifications rather than from a local guess.
  useEffect(() => {
    if (!sourceId) {
      return;
    }
    let cancelled = false;
    const unsubscribe = DownloadService.subscribe(() => {
      void readSaved().then((saved) => {
        if (!cancelled) {
          setLoaded((current) => (current ? { ...current, saved } : current));
        }
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sourceId]);

  const refresh = useCallback(
    async (options: { refresh?: boolean } = {}) => {
      if (!sourceId) {
        return;
      }
      if (options.refresh) {
        setRefreshing(true);
      }
      try {
        setLoaded(await loadFor(sourceId, options.refresh ?? false));
      } finally {
        setRefreshing(false);
      }
    },
    [sourceId],
  );

  const toggleFavorite = useCallback(
    async (collection: OnlineCollection) => {
      const isFavorite = loaded?.saved[collection.key]?.isFavorite ?? false;
      await OnlineCatalogService.saveCollection(collection, { favorite: !isFavorite });
      const next = await readSaved();
      setLoaded((previous) => (previous ? { ...previous, saved: next } : previous));
    },
    [loaded],
  );

  const download = useCallback(async (collection: OnlineCollection) => {
    setActionError(null);
    try {
      // Load first: this is what writes the collection's track rows. Without it
      // the queue would be empty and the download would fail on the first file
      // with a message that blames the connection.
      await OnlineCatalogService.loadCollection(collection.key);
      await DownloadService.startDownload(collection.key);
    } catch (caught) {
      setActionError(messageOf(caught));
    } finally {
      const next = await readSaved();
      setLoaded((previous) => (previous ? { ...previous, saved: next } : previous));
    }
  }, []);

  const current = loaded && loaded.sourceId === sourceId ? loaded : null;

  return {
    collections: current?.collections ?? EMPTY_COLLECTIONS,
    saved: current?.saved ?? EMPTY_SAVED,
    // "Nothing for this source yet" *is* the loading condition — derived from
    // the load rather than tracked beside it, so the two cannot disagree.
    loading: sourceId !== null && current === null,
    refreshing,
    error: actionError ?? current?.error ?? null,
    refresh,
    toggleFavorite,
    download,
  };
}
