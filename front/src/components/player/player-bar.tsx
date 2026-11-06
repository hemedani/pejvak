"use client";

/**
 * The dock.
 *
 * It used to be a bar: full-bleed, flush to the window edge, a border-top and a
 * blur. A strip pinned to the bottom of the window reads as chrome — the browser
 * growing a toolbar — and it also competed with the content it covered, because
 * two flat planes with a hairline between them have no depth ordering.
 *
 * So it is a float now: narrower than the content column, inset from every edge,
 * rounded, with the liquid-glass material (`.glass-dock`) and the current
 * track's own colour bleeding out from underneath it. That is the two-materials
 * rule doing its job rather than being obeyed — the page is opaque because you
 * read it, the dock is glass because it moves over the page.
 *
 * ## Three decisions worth knowing
 *
 * **The wave stays `--accent`.** It is tempting to tint it from the track and it
 * would look good in isolation, but `--accent` is the app's word for *state*, and
 * "heard" is state (see `docs/UI-REVIEW.md` §1). The per-track colour lives in
 * the glow behind the dock and in the artwork's shadow, where it can be loud
 * without ever meaning "played".
 *
 * **The wave is the top edge, inset by the corner radius.** At `top-0` inset by
 * `--radius-xl` it lands exactly on the flat part of the top edge, so it reads as
 * the leading edge of the slab rather than as a line that got clipped by the
 * corners. It also costs no vertical space, which a wave in the flow would.
 *
 * **The glow is one radial gradient, not a blurred element.** A `filter: blur()`
 * here would be a full-size compositor layer repainted every time the dock
 * lifts; a gradient with a soft stop is the same picture for one paint.
 *
 * The queue sheet is mounted here, once, so the sidebar slot and the full player
 * can ask for the same sheet.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Icon } from "@/components/ui/icon";
import { paletteFor, withAlpha } from "@/lib/palette";
import { closePlayer } from "@/lib/player/controller";
import { progressRatio } from "@/lib/player/progressSmoothing";
import { formatClock } from "@/lib/time";
import { usePlayerStore } from "@/stores/player";

import { OPEN_QUEUE_EVENT } from "./queue-events";
import { PlaybackStatusLine } from "./playback-status-line";
import { QueueSheet } from "./queue-sheet";
import { SpeedMenu } from "./speed-menu";
import { TrackArtwork } from "./track-artwork";
import { TransportControls } from "./transport-controls";
import { useBootPlayer, usePlayerKeyboard } from "./use-player";
import { VolumeControl } from "./volume-control";
import { WavyProgress } from "./wavy-progress";

export function PlayerBar() {
  useBootPlayer();
  usePlayerKeyboard();

  const current = usePlayerStore((state) => state.current);
  const pathname = usePathname();
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    const open = () => setQueueOpen(true);
    window.addEventListener(OPEN_QUEUE_EVENT, open);
    return () => window.removeEventListener(OPEN_QUEUE_EVENT, open);
  }, []);

  // The full player screen at `/player` is the same store and the same engine;
  // showing the mini dock there is an unnecessary repetition of what the screen
  // already shows. The queue sheet stays mounted so the full player can still
  // request it.
  const onPlayerRoute = pathname === "/player";
  const barVisible = current !== null && !onPlayerRoute;

  // Toggle a data attribute on `<body>` so the shell's `<main>` can adjust its
  // bottom padding. The space reserved for the dock is only needed when the dock
  // is actually shown — without this, the player route has a strip of dead space
  // where the dock would have been.
  //
  // The same effect publishes `--dock-height`, because the dock is not the only
  // thing that has to know where it ends: a sheet anchors its bottom edge here
  // so a dialog never covers the player (`globals.css`, `--sheet-clearance`).
  // Measured rather than derived from `--layout-player-bar`, which is a
  // min-height inside a padded container and is not the number anyone wants.
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.dataset.playerBar = barVisible ? "visible" : "hidden";

    const dock = dockRef.current;
    if (dock) {
      const publish = () => {
        document.body.style.setProperty(
          "--dock-height",
          `${dock.getBoundingClientRect().height}px`,
        );
      };
      publish();

      // The dock's height changes with the viewport (the padding steps up at
      // `sm`) and with the presence of the progress bar, so it is observed
      // rather than read once.
      const observer = new ResizeObserver(publish);
      observer.observe(dock);

      return () => {
        observer.disconnect();
        document.body.style.removeProperty("--dock-height");
        delete document.body.dataset.playerBar;
      };
    }

    document.body.style.removeProperty("--dock-height");
    return () => {
      delete document.body.dataset.playerBar;
    };
  }, [barVisible]);

  if (!current || onPlayerRoute) {
    return <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />;
  }

  /**
   * The track's own colour, declared once on the floating container so both the
   * glow behind the glass and the artwork's shadow read the same value. It is
   * the *bright* stop of the ramp: the deep one disappears against the shadow
   * the dock already casts.
   *
   * Two properties, because the two consumers need different alphas and one of
   * them cannot be expressed in CSS: the glow's loudness is a theme decision
   * (`--glass-glow-alpha`, applied as `opacity`), while a `box-shadow` colour
   * has no opacity of its own — so the artwork's shadow is pre-mixed here.
   */
  const glow = paletteFor(current.contentHash)[1];

  return (
    <>
      <div
        ref={dockRef}
        className="fixed inset-x-0 bottom-0 z-30 lg:ms-[var(--layout-sidebar)] print:hidden"
        data-player-surface
        style={{ "--dock-glow": glow, "--dock-glow-soft": withAlpha(glow, 0.55) } as CSSProperties}
      >
        <div className="relative mx-auto w-full max-w-[var(--layout-dock)] px-[var(--space-md)] pb-[var(--space-md)] sm:px-[var(--space-lg)] sm:pb-[var(--space-lg)]">
          {/*
            The wash reaching the float. It starts above the dock and runs past
            its bottom edge so the light appears to come from under it, and it is
            `-z-10` inside the container's own stacking context — above the page,
            below the glass, never over a control.
          */}
          <div
            aria-hidden
            className="dock-glow pointer-events-none absolute inset-x-[var(--space-xxl)] -top-[var(--space-xxl)] -bottom-[var(--space-xs)] -z-10"
          />

          <div className="glass-dock overflow-hidden rounded-[var(--radius-xl)]">
            <BarProgress />

            <div className="flex min-h-[var(--layout-player-bar)] items-center gap-[var(--space-sm)] px-[var(--space-sm)] py-[var(--space-sm)] sm:gap-[var(--space-md)] sm:px-[var(--space-md)]">
              <Link
                href="/player"
                // The visible text names the track; the label says where the
                // link goes. Both, because a screen reader that only heard
                // "Song — Artist" would not know it opens the full player, and
                // one that only heard "Open the full player" would not know
                // which track it is.
                aria-label={`Open the full player: ${current.title}`}
                className="flex min-w-0 flex-1 items-center gap-[var(--space-md)] rounded-[var(--radius-md)] p-[var(--space-xxs)] hover:bg-surface-sunken/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:w-64 sm:flex-none"
              >
                <TrackArtwork
                  track={current}
                  className="dock-art size-12 rounded-[var(--radius-sm)]"
                />
                <span className="min-w-0">
                  <span dir="auto" className="type-label block truncate text-text">{current.title}</span>
                  <span dir="auto" className="type-caption block truncate text-text-secondary">
                    {current.artist ?? (current.origin === "local" ? "On your device" : "Unknown artist")}
                  </span>
                </span>
              </Link>

              <div className="hidden min-w-0 flex-1 flex-col items-center gap-[var(--space-xxs)] sm:flex">
                <TransportControls compact />
                <div className="max-w-full truncate">
                  <PlaybackStatusLine />
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-[var(--space-xs)]">
                <div className="hidden md:block">
                  <SpeedMenu compact />
                </div>
                <div className="hidden md:block">
                  <VolumeControl />
                </div>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  aria-label="Playback queue"
                  onClick={() => setQueueOpen(true)}
                >
                  <Icon name="queue" size="md" />
                </button>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-tertiary hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  aria-label="Close the player"
                  onClick={closePlayer}
                >
                  <Icon name="close" size="md" />
                </button>
              </div>
            </div>

            <div className="px-[var(--space-md)] pb-[var(--space-sm)] sm:hidden">
              <TransportControls compact />
            </div>
          </div>
        </div>
      </div>

      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
    </>
  );
}

/** The dock's top edge — drawn as the same wave the player screen uses. */
function BarProgress() {
  const positionSec = usePlayerStore((state) => state.positionSec);
  const durationSec = usePlayerStore((state) => state.durationSec);
  const playing = usePlayerStore((state) => state.status === "playing");
  const waiting = usePlayerStore((state) => state.waiting !== null);
  const isLive = usePlayerStore((state) => state.current?.isLive === true);
  const ratio = isLive ? 1 : progressRatio(positionSec, durationSec);

  return (
    <div
      // Inset by the corner radius so the stroke begins where the top edge
      // becomes flat. At `inset-x-0` the rounded corners would eat both ends of
      // the line and it would look like a rendering bug.
      className="absolute inset-x-[var(--radius-xl)] top-0"
      role="progressbar"
      aria-label="Playback progress"
      aria-valuemin={0}
      aria-valuemax={durationSec > 0 ? durationSec : undefined}
      aria-valuenow={durationSec > 0 ? Math.min(positionSec, durationSec) : undefined}
      aria-valuetext={
        durationSec > 0 ? `${formatClock(positionSec)} of ${formatClock(durationSec)}` : undefined
      }
    >
      {/*
        The same stroke at a quarter of the height. The dock is not a second
        scrubber — it answers "how far" and nothing else — but it answers in the
        app's own word for audio moving, so a paused dock is visibly still and a
        loading one visibly travels.
      */}
      <WavyProgress
        progress={ratio}
        isPlaying={playing}
        sweeping={waiting}
        tint="var(--accent)"
        trackColor="var(--track)"
        thickness={2}
        amplitude={1.4}
        wavelength={22}
        bandHeight={8}
        gap={0}
      />
    </div>
  );
}
