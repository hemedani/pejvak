/**
 * Whether a client-side navigation is waiting on the server.
 *
 * ## Why the player has to know
 *
 * Next 16's Turbopack flight client crashes (`chunk.reason.enqueueModel is not a
 * function`) when a React state update lands while it is still reading an RSC
 * stream (`vercel/next.js#92362`). The audio element is the one thing in this app
 * that updates React on its own, roughly once a second, and it does not pause
 * because the listener clicked a sidebar link. On a slow backend the history
 * stream stays open long enough for that write to collide with it.
 *
 * The documented workaround is to stop the concurrent activity *before* the
 * navigation starts — not to wrap it in `startTransition`, which the same report
 * confirms does not help. So this module marks the window between a link click
 * (or Back/Forward) and the URL commit, and the controller uses it to skip the
 * one high-frequency store write. Session maths still runs; only the render is
 * deferred.
 *
 * ## Why these signals
 *
 * `click` is captured at the document in the capture phase, so it runs before
 * Next's own anchor handler and therefore before the flight fetch begins.
 * `popstate` is the Back/Forward equivalent. Both are universal.
 *
 * The disarm path has to distinguish "the navigation finished" from "it never
 * happened". `currententrychange` fires for any URL commit, including
 * `pushState`/`replaceState`, so it covers query-only navigations too; where the
 * Navigation API is missing, the shell's `usePathname` effect is the fallback for
 * pathname changes. The timeout is the last resort for a navigation that is
 * somehow neither — it is generous on purpose, because disarming early is what
 * would let the crash back in.
 */

type NavigationLike = {
  addEventListener(type: "currententrychange", listener: () => void): void;
  removeEventListener(type: "currententrychange", listener: () => void): void;
};

/**
 * Long enough to outlast a slow backend read, short enough that a navigation
 * which never commits cannot freeze the progress hairline for the session.
 */
const SAFETY_MS = 8_000;

let navigating = false;
let safety: ReturnType<typeof setTimeout> | null = null;

export function isNavigationInFlight(): boolean {
  return navigating;
}

export function beginNavigation(): void {
  navigating = true;
  if (safety !== null) {
    clearTimeout(safety);
  }
  safety = setTimeout(endNavigation, SAFETY_MS);
}

export function endNavigation(): void {
  navigating = false;
  if (safety !== null) {
    clearTimeout(safety);
    safety = null;
  }
}

function navigationApi(): NavigationLike | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as unknown as { navigation?: NavigationLike }).navigation ?? null;
}

/**
 * A plain left click on a same-origin link that is not a download, a new tab or
 * a jump within the current document. Everything else either is not a
 * navigation or is one this component never sees.
 */
function isNavigationClick(target: EventTarget | null, event: MouseEvent): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }

  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) {
    return false;
  }
  if (anchor.target && anchor.target !== "_self") {
    return false;
  }
  if (anchor.hasAttribute("download") || !anchor.href) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) {
    return false;
  }

  // Same path and query: a fragment jump or a click on the current page. Neither
  // reads an RSC stream, and arming for one would freeze the bar until the
  // safety timeout.
  return !(
    url.pathname === window.location.pathname && url.search === window.location.search
  );
}

/**
 * Installs the listeners. Returns the cleanup, so the shell leaf can unmount
 * without leaving document-level handlers behind.
 */
export function startNavigationSignal(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onClick = (event: MouseEvent) => {
    if (isNavigationClick(event.target, event)) {
      beginNavigation();
    }
  };
  const onPopState = () => beginNavigation();

  document.addEventListener("click", onClick, true);
  window.addEventListener("popstate", onPopState);

  const navigation = navigationApi();
  const onEntryChange = () => endNavigation();
  navigation?.addEventListener("currententrychange", onEntryChange);

  return () => {
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("popstate", onPopState);
    navigation?.removeEventListener("currententrychange", onEntryChange);
  };
}
