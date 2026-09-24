/**
 * The "show me this collection's history" control.
 *
 * One component so the folder card, the playlist row, the two collection headers
 * and every track row inside them all open the same sheet with the same label —
 * a per-screen copy of this would eventually disagree about what "history"
 * means, and one of them would end up opening the track's history instead.
 */

import { BouncyIconButton, type BouncyIconButtonTone } from "@/components/motion/BouncyIconButton";
import type { ContextType } from "@/lib/db/types";
import { describeContextType } from "@/lib/playbackContext";
import { useContextHistoryStore } from "@/store/contextHistoryStore";

export type ContextHistoryButtonProps = {
  /** A folder key or a local playlist id. */
  type: ContextType;
  /**
   * Named `contextKey` rather than `key`: `key` is a reserved React prop, and a
   * component that accepts one is a component whose callers cannot pass a
   * `key` of their own without the two silently colliding.
   */
  contextKey: string;
  title: string;
  artwork?: string | null;
  size?: number;
  iconSize?: number;
  tone?: BouncyIconButtonTone;
};

export function ContextHistoryButton({
  type,
  contextKey,
  title,
  artwork,
  size = 36,
  iconSize = 17,
  tone = "ghost",
}: ContextHistoryButtonProps) {
  const open = useContextHistoryStore((state) => state.open);

  return (
    <BouncyIconButton
      name="history"
      accessibilityLabel={`History for ${describeContextType(type).toLowerCase()} ${title}`}
      size={size}
      iconSize={iconSize}
      tone={tone}
      onPress={() => open({ type, key: contextKey, title, artwork })}
    />
  );
}
