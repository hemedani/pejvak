import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Pejvak", template: "%s · Pejvak" },
  description: "The Pejvak listening console: your library, your listening history, and online playback.",
};

export const viewport: Viewport = {
  // The two canvas colours, so the browser chrome does not flash white when the
  // dark theme loads.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F3ED" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

/**
 * Applied before the first paint, and only when there is no cookie.
 *
 * Without it a listener whose system is dark sees a white page for one frame and
 * then a flash of dark — the classic theme-switch bug. With it, the class is on
 * `<html>` before any content is laid out.
 */
const THEME_BOOTSTRAP = `(function(){try{if(/(?:^|; )theme=(dark|light)/.test(document.cookie))return;if(window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("theme")?.value;
  const dark = theme === "dark";

  return (
    <html
      lang="en"
      dir="ltr"
      className={dark ? "dark" : undefined}
      // The bootstrap script may add `.dark` before hydration, so the server's
      // class and the client's first read can differ by design.
      suppressHydrationWarning
    >
      {/* The bootstrap runs as the first thing in `<body>`, so it is executed
          before the content below is parsed — no flash, and no hand-written
          `<head>`, which App Router does not want. */}
      <body
        className="min-h-dvh bg-canvas text-text antialiased"
        // Browser extensions (Grammarly, password managers, etc.) inject
        // `data-*` attributes onto `<body>` before React hydrates, which
        // triggers a hydration mismatch. `suppressHydrationWarning` tells
        // React to ignore attribute differences on this element — the same
        // approach already used on `<html>` for the theme bootstrap.
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {children}
      </body>
    </html>
  );
}
