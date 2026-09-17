import { useCallback, useEffect, useState } from "react";

import type { SmartPlaylist, SmartRuleId } from "@/lib/smartPlaylists";
import { SmartPlaylistService } from "@/services/SmartPlaylistService";

export type UseSmartPlaylistResult = {
  data: SmartPlaylist | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

type Loaded = { key: string; data: SmartPlaylist };

/**
 * One recipe's picks.
 *
 * Keyed by rule **and** budget: the commute list changes the moment the listener
 * picks a different journey length, and keying on the rule alone would leave the
 * previous budget's picks on screen while the new ones load.
 */
export function useSmartPlaylist(
  ruleId: SmartRuleId | null,
  budgetSec?: number,
): UseSmartPlaylistResult {
  const key = ruleId ? `${ruleId}:${budgetSec ?? ""}` : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!ruleId || !key) {
      return;
    }
    let cancelled = false;
    void SmartPlaylistService.build(ruleId, { budgetSec }).then((data) => {
      if (!cancelled) {
        setLoaded({ key, data });
        setPending(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ruleId, key, budgetSec]);

  const refresh = useCallback(async () => {
    if (!ruleId || !key) {
      setLoaded(null);
      setPending(false);
      return;
    }
    setLoaded({ key, data: await SmartPlaylistService.build(ruleId, { budgetSec }) });
    setPending(false);
  }, [ruleId, key, budgetSec]);

  const data = loaded && loaded.key === key ? loaded.data : null;
  const loading = key ? pending && data === null : false;

  return { data, loading, refresh };
}
