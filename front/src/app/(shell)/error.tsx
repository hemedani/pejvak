"use client";

import { RouteError } from "@/components/ui/route-error";

/** Inside the shell: the sidebar and top bar stay, only the content is replaced. */
export default function ShellError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RouteError error={error} retry={retry} scope="shell" />;
}
