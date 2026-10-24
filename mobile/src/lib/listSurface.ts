/**
 * Where a row sits in a virtualised list surface.
 *
 * `ListGroup` used to derive this by cloning its children; a `FlatList` cannot,
 * because the group is not one component. The caller computes the position from
 * the section's own bounds instead, and the surface draws the matching card
 * edge across cells.
 */
export type ListRowPosition = "only" | "first" | "middle" | "last";

export function rowPositionFor(index: number, count: number): ListRowPosition {
  if (count <= 1) {
    return "only";
  }
  if (index <= 0) {
    return "first";
  }
  return index >= count - 1 ? "last" : "middle";
}
