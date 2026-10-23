/**
 * A recorded listen, in the same anatomy as every other row.
 *
 * History is a record, not a track: the title identifies it, the time range and
 * context say when and where, but the duration and the outcome are the reason
 * the row exists. Tapping inspects the listen; resuming stays a separate action
 * inside the session sheet, which is the behaviour listeners already learned.
 */

import { ListRow, type ListRowProps } from "@/components/ui/row/list-row";

export type RecordRowProps = Omit<ListRowProps, "titleLines">;

export function RecordRow(props: RecordRowProps) {
  return <ListRow titleLines={2} {...props} />;
}
