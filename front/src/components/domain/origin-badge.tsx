/**
 * A track's origin, as a badge.
 *
 * The library, the track page, and the history all carry the same fact — is the
 * audio on the listener's phone or on a server? — and the badge that says so is
 * one component, not three. The icon makes it legible at a glance: a phone for
 * local, a cloud for online. The tone follows the existing vocabulary (`muted`
 * for local, `accent` for online), so the colour-blind reading is the same as
 * it was.
 *
 * This is a *report*, not a filter (plan §7.6): the badge is never clickable.
 */

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { TrackOrigin } from "@/lib/domain/track";

type OriginBadgeProps = {
  origin: TrackOrigin;
  /** Whether to show the text label alongside the icon. Defaults to `true`. */
  showLabel?: boolean;
  /** Badge size, passed through to `Badge`. */
  size?: "sm" | "md";
  className?: string;
};

export function OriginBadge({
  origin,
  showLabel = true,
  size = "sm",
  className,
}: OriginBadgeProps) {
  const isLocal = origin === "local";

  return (
    <Badge tone={isLocal ? "muted" : "accent"} size={size} className={className}>
      <Icon name={isLocal ? "device" : "cloud"} size="xs" />
      {showLabel ? (isLocal ? "Local" : "Online") : null}
    </Badge>
  );
}
