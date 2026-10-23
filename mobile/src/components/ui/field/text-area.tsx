import { TextField, type TextFieldProps } from "@/components/ui/text-field";

export type TextAreaProps = Omit<
  TextFieldProps,
  "multiline" | "minLines" | "maxLines"
> & {
  minLines?: number;
  maxLines?: number;
};

/**
 * A note, a description, a composer — prose that needs more than one line.
 *
 * It is still the one `TextField`: same label row, same ring, same message.
 * Only the track's content layout changes, from a centred row to a stretch
 * column that grows with the text and then scrolls inside itself.
 */
export function TextArea({
  minLines = 3,
  maxLines = 8,
  scrollEnabled = true,
  ...rest
}: TextAreaProps) {
  return (
    <TextField
      multiline
      minLines={minLines}
      maxLines={maxLines}
      scrollEnabled={scrollEnabled}
      {...rest}
    />
  );
}
