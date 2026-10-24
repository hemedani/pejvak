/**
 * One set of virtualisation numbers for every long list.
 *
 * `FlatList`'s defaults are tuned for a feed of complex cards at 60 fps on a
 * mid-range phone, and they keep about three screens of cells mounted. These
 * screens are dense rows drawn from SQLite: eight cells cover the opening
 * screenful, and a smaller window means a fling mounts fewer rows it will
 * immediately unmount. A larger `windowSize` was measurable in blank cells, not
 * in dropped frames, so the trade is deliberate.
 *
 * `removeClippedSubviews` is *not* here: several screens draw an absolutely
 * positioned overlay outside their row's bounds (the dock, reveal wrappers), and
 * the flag would clip them.
 */
export const listPerformance = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 50,
  windowSize: 7,
} as const;
