import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Platform, StyleSheet, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassChip, GlassProgress, GlassSurface } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useTheme } from "@/hooks/use-theme";
import { radius as radii, spacing } from "@/theme/tokens";
import {
  describePermissionRefusal,
  enumerateDeviceAudio,
  enumerateFolder,
  identifyFiles,
  isDeviceScanSupported,
  requestAudioPermission,
  requestFolderAccess,
  type FolderGrant,
  type IdentifiedFile,
} from "@/services/DeviceScanService";
import {
  findGoneLocations,
  importIdentifiedFiles,
  loadLibraryIndex,
  type ImportOutcome,
} from "@/services/ImportService";
import {
  buildScanPlan,
  libraryEntriesToVerify,
  needsIdentification,
  type ScanCandidate,
  type ScanPlan,
  type ScanStatus,
} from "@/lib/scanPlan";

/**
 * Device import, in the order the user actually needs it: choose a source, watch
 * it find things, see exactly what it found, then decide.
 *
 * Nothing is written to SQLite until the final tap. The preview is built from an
 * in-memory plan, which is also why `tracks.content_hash`'s NOT NULL constraint
 * never has to be relaxed to accommodate a half-finished scan.
 */

type Phase = "choose" | "scanning" | "preview" | "importing" | "done";

const ROW_REVEAL_LIMIT = 12;

/**
 * Fixed for the life of the build, so it is resolved once rather than per render.
 * False in Expo Go, where the media index is out of reach entirely.
 */
const DEVICE_SCAN_SUPPORTED = isDeviceScanSupported();

const STATUS_LABEL: Record<ScanStatus, string> = {
  new: "New",
  changed: "Changed",
  known: "In library",
  duplicate: "Duplicate",
  // "Moved" rather than "Relink": the listener moved a folder, they did not ask
  // for a database operation.
  relink: "Moved",
};

function summaryLine(plan: ScanPlan): string {
  const { total, new: fresh, changed, known, duplicate, relink } = plan.summary;
  const parts = [`${total} found`];
  if (fresh > 0) {
    parts.push(`${fresh} new`);
  }
  if (relink > 0) {
    parts.push(`${relink} moved`);
  }
  if (changed > 0) {
    parts.push(`${changed} changed`);
  }
  if (known > 0) {
    parts.push(`${known} already here`);
  }
  if (duplicate > 0) {
    parts.push(`${duplicate} duplicate${duplicate === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

export default function ImportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const cancelled = useRef(false);

  const [phase, setPhase] = useState<Phase>("choose");
  const [busyLabel, setBusyLabel] = useState("Reading the media index…");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [plan, setPlan] = useState<ScanPlan | null>(null);
  const [identified, setIdentified] = useState<IdentifiedFile[] | null>(null);
  const [grants, setGrants] = useState<FolderGrant[]>([]);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [newOnly, setNewOnly] = useState(true);

  const actionable = useMemo(
    () => (plan?.candidates ?? []).filter((candidate) => needsIdentification(candidate.status)),
    [plan],
  );

  const visible = useMemo(
    () => (newOnly ? actionable : (plan?.candidates ?? [])),
    [actionable, newOnly, plan],
  );

  /**
   * The button has to name both outcomes when both are on the table: "Import 3
   * files" would be a lie about the two that are already in the library and
   * only need re-pointing.
   */
  const hasRelinks = useMemo(
    () => actionable.some((candidate) => candidate.status === "relink"),
    [actionable],
  );

  /** Runs the identify pass and keeps the preview readable while it works. */
  const identify = useCallback(async (candidates: ScanCandidate[]) => {
    const needsWork = candidates.filter((candidate) => needsIdentification(candidate.status));
    if (needsWork.length === 0) {
      setIdentified([]);
      return;
    }

    setBusyLabel("Identifying files…");
    const result = await identifyFiles(needsWork, {
      isCancelled: () => cancelled.current,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    if (!cancelled.current) {
      setIdentified(result.identified);
    }
  }, []);

  const runScan = useCallback(
    async (source: "device" | "folder") => {
      cancelled.current = false;
      setPhase("scanning");
      setProgress({ done: 0, total: 0 });
      setBusyLabel("Reading the media index…");

      try {
        let found;
        let granted: FolderGrant[] = [];

        if (source === "device") {
          const refusal = describePermissionRefusal(await requestAudioPermission());
          if (refusal) {
            setPhase("choose");
            Alert.alert(refusal.title, refusal.message);
            return;
          }
          found = await enumerateDeviceAudio((count, estimated) =>
            setProgress({ done: count, total: estimated }),
          );
        } else {
          const grant = await requestFolderAccess();
          if (!grant) {
            setPhase("choose");
            return;
          }
          granted = [grant];
          found = await enumerateFolder(grant);
        }

        if (cancelled.current) {
          return;
        }

        setBusyLabel("Comparing against your library…");
        const library = await loadLibraryIndex();
        // A moved file carries the same content hash as the row it left behind,
        // so the plan cannot tell it from a second copy on hashes alone. Ask the
        // filesystem which recorded locations have gone — but only about the
        // rows a found file could match, not the whole library.
        const gone = await findGoneLocations(libraryEntriesToVerify(found, library));
        const built = buildScanPlan(found, library, gone);

        setGrants(granted);
        setPlan(built);
        setIdentified(null);
        setPhase("preview");

        await identify(built.candidates);
      } catch (error) {
        if (!cancelled.current) {
          setPhase("choose");
          Alert.alert(
            "Scan failed",
            error instanceof Error ? error.message : "The scan could not be completed.",
          );
        }
      }
    },
    [identify],
  );

  const commit = useCallback(async () => {
    if (!identified) {
      return;
    }
    setPhase("importing");
    setProgress({ done: 0, total: identified.length });
    const result = await importIdentifiedFiles(identified, {
      grants,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setOutcome(result);
    setPhase("done");
  }, [grants, identified]);

  const identifying = phase === "preview" && identified === null;

  const header = (
    <View style={styles.headerBlock}>
      <ScreenHeader
        overline="IMPORT"
        title="Add audio"
        subtitle={plan ? summaryLine(plan) : "Scan this device, or point at a folder"}
        action={
          <BouncyIconButton
            name="close"
            accessibilityLabel="Close import"
            size={42}
            iconSize={20}
            tone="glass"
            onPress={() => router.back()}
          />
        }
      />
    </View>
  );

  const body = () => {
    if (phase === "choose") {
      return (
        <View style={styles.chooseBlock}>
          <Reveal index={1}>
            <GlassSurface tone="surfaceStrong" style={styles.chooseCard}>
              <ThemedText type="bodyStrong">Scan this device</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {DEVICE_SCAN_SUPPORTED
                  ? "Lists every audio file the system has indexed — audiobooks, music, downloads and voice recordings alike. Nothing is imported until you confirm."
                  : "Expo Go ships without the audio permission, so the media index is out of reach here. Choose a folder instead — that works everywhere. A development build unlocks the full scan."}
              </ThemedText>
              <PrimaryButton
                label={DEVICE_SCAN_SUPPORTED ? "Scan device" : "Needs a development build"}
                disabled={!DEVICE_SCAN_SUPPORTED}
                onPress={() => void runScan("device")}
              />
            </GlassSurface>
          </Reveal>

          <Reveal index={2}>
            <GlassSurface tone="surfaceStrong" style={styles.chooseCard}>
              <ThemedText type="bodyStrong">Choose a folder</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                Best for a lecture series. The folder becomes playable as one unit, and its order
                follows the files inside it.
              </ThemedText>
              <PrimaryButton
                label={Platform.OS === "android" ? "Pick a folder" : "Not available here"}
                disabled={Platform.OS !== "android"}
                onPress={() => void runScan("folder")}
              />
            </GlassSurface>
          </Reveal>
        </View>
      );
    }

    if (phase === "scanning" || phase === "importing") {
      const label = phase === "importing" ? "Importing…" : busyLabel;
      return (
        <Reveal index={1}>
          <GlassSurface tone="surfaceStrong" style={styles.progressCard}>
            <ThemedText type="bodyStrong">{label}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {progress.total > 0
                ? `${progress.done} of ${progress.total}`
                : "This can take a moment on a large library."}
            </ThemedText>
            <GlassProgress
              progress={progress.total > 0 ? progress.done / progress.total : 0}
              tint={theme.accent}
            />
          </GlassSurface>
        </Reveal>
      );
    }

    if (phase === "done" && outcome) {
      const { imported, relinked, duplicates, failed } = outcome;
      const headlineParts: string[] = [];
      if (imported.length > 0) {
        headlineParts.push(`${imported.length} added`);
      }
      if (relinked > 0) {
        headlineParts.push(`${relinked} relinked`);
      }
      const detail =
        [
          relinked > 0 ? "relinked tracks keep their history and notes" : null,
          duplicates > 0 ? `${duplicates} already in your library` : null,
          failed > 0 ? `${failed} could not be read` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Everything found was already in your library.";

      return (
        <Reveal index={1}>
          <GlassSurface tone="surfaceStrong" style={styles.progressCard}>
            <ThemedText type="bodyStrong">
              {headlineParts.length > 0 ? headlineParts.join(" · ") : "Nothing new to add"}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {detail}
            </ThemedText>
            <PrimaryButton label="Back to library" onPress={() => router.back()} />
          </GlassSurface>
        </Reveal>
      );
    }

    return null;
  };

  return (
    <Screen wash={theme.accent}>
      <FlatList
        data={phase === "preview" ? visible : []}
        keyExtractor={(item) => item.sourceId}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {header}
            {body()}
            {phase === "preview" ? (
              <View style={styles.previewHeader}>
                <View style={styles.chipRow}>
                  <GlassChip
                    label={`New or moved (${actionable.length})`}
                    selected={newOnly}
                    onPress={() => setNewOnly(true)}
                  />
                  <GlassChip
                    label={`All (${plan?.summary.total ?? 0})`}
                    selected={!newOnly}
                    onPress={() => setNewOnly(false)}
                  />
                </View>
                <PrimaryButton
                  label={
                    identifying
                      ? "Identifying…"
                      : hasRelinks
                        ? `Add or relink ${actionable.length} file${actionable.length === 1 ? "" : "s"}`
                        : `Import ${actionable.length} file${actionable.length === 1 ? "" : "s"}`
                  }
                  loading={identifying}
                  disabled={actionable.length === 0}
                  onPress={() => void commit()}
                />
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          phase === "preview" && !identifying && visible.length === 0 ? (
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              {newOnly
                ? "Nothing here needs adding or relinking."
                : "No audio files were found."}
            </ThemedText>
          ) : null
        }
        renderItem={({ item, index }) => (
          <Reveal index={index + 3} from="below" limit={ROW_REVEAL_LIMIT}>
            <GlassSurface flat style={styles.row}>
              <View style={styles.rowCopy}>
                <ThemedText type="bodyStrong" numberOfLines={1}>
                  {item.fileName}
                </ThemedText>
                <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
                  {item.folderName ?? "No folder"}
                </ThemedText>
              </View>
              <ThemedText
                type="caption"
                themeColor={needsIdentification(item.status) ? "text" : "textTertiary"}>
                {STATUS_LABEL[item.status]}
              </ThemedText>
            </GlassSurface>
          </Reveal>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + 96,
  },
  headerBlock: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  chooseBlock: {
    gap: spacing.md,
  },
  chooseCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.xl,
  },
  progressCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.xl,
  },
  previewHeader: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
