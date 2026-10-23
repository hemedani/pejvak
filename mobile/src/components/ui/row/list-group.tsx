/**
 * A dense list is one card, not a stack of them.
 *
 * Thirty tracks in a course used to be thirty panels with eight points between
 * them, which is both slower and harder to scan: the eye reads thirty edges
 * where it should read one list. One `Card` with hairline-separated rows says
 * "these belong together", and a sequence is exactly what the listener is
 * asking about inside a folder, playlist or course.
 *
 * The group owns the surface; each `ListRow` owns its own inset divider, so the
 * first row has no stray line against the card's top edge.
 */

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { Card } from "@/components/ui/card";
import type { ListRowPosition } from "@/components/ui/row/list-row";

export type ListGroupProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ListGroup({ children, style }: ListGroupProps) {
  const items = Children.toArray(children);
  const last = items.length - 1;

  return (
    <Card padded={false} elevated={false} style={style}>
      {items.map((child, index) => {
        if (!isValidElement(child)) {
          return child;
        }
        const position: ListRowPosition =
          items.length === 1 ? "only" : index === 0 ? "first" : index === last ? "last" : "middle";
        return cloneElement(child as ReactElement<{ position?: ListRowPosition }>, {
          position,
        });
      })}
    </Card>
  );
}
