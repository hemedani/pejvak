import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "پژواک", template: "%s · پژواک" },
  description: "کنسول شنیدن پژواک: کتابخانه، تاریخ شنیدن و پخش آنلاین.",
};

export const viewport: Viewport = {
  // The two canvas colours, so the browser chrome does not flash white when the
  // dark theme loads.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E4E9EF" },
    { media: "(prefers-color-scheme: dark)", color: "#060910" },
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
      lang="fa"
      dir="rtl"
      className={dark ? "dark" : undefined}
      // The bootstrap script may add `.dark` before hydration, so the server's
      // class and the client's first read can differ by design.
      suppressHydrationWarning
    >
      {/* The bootstrap runs as the first thing in `<body>`, so it is executed
          before the content below is parsed — no flash, and no hand-written
          `<head>`, which App Router does not want. */}
      <body className="min-h-dvh bg-canvas text-text antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {children}
      </body>
    </html>
  );
}
