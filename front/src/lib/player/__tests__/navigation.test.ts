// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  beginNavigation,
  endNavigation,
  isNavigationInFlight,
  startNavigationSignal,
} from "../navigation";

let cleanup: (() => void) | null = null;

function anchor(href: string): HTMLAnchorElement {
  const element = document.createElement("a");
  element.href = href;
  element.textContent = href;
  // jsdom otherwise tries to navigate on the default action, which is not what
  // the capture-phase listener under test needs.
  element.addEventListener("click", (event) => event.preventDefault());
  document.body.append(element);
  return element;
}

beforeEach(() => {
  vi.useFakeTimers();
  endNavigation();
  cleanup = startNavigationSignal();
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.replaceChildren();
  endNavigation();
  vi.useRealTimers();
});

describe("navigation signal", () => {
  it("is false until a navigation begins", () => {
    expect(isNavigationInFlight()).toBe(false);
    beginNavigation();
    expect(isNavigationInFlight()).toBe(true);
    endNavigation();
    expect(isNavigationInFlight()).toBe(false);
  });

  it("clears itself when a navigation never commits", () => {
    beginNavigation();
    vi.advanceTimersByTime(8_001);
    expect(isNavigationInFlight()).toBe(false);
  });

  it("restarts the safety window on a second begin", () => {
    beginNavigation();
    vi.advanceTimersByTime(5_000);
    beginNavigation();
    vi.advanceTimersByTime(5_000);
    expect(isNavigationInFlight()).toBe(true);
  });

  it("arms on a plain same-origin link click", () => {
    anchor("/history").click();
    expect(isNavigationInFlight()).toBe(true);
  });

  it("arms on Back and Forward", () => {
    window.dispatchEvent(new Event("popstate"));
    expect(isNavigationInFlight()).toBe(true);
  });

  it("ignores modifier clicks", () => {
    const element = anchor("/history");
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }),
    );
    expect(isNavigationInFlight()).toBe(false);
  });

  it("ignores a foreign link", () => {
    anchor("https://example.com/elsewhere").click();
    expect(isNavigationInFlight()).toBe(false);
  });

  it("ignores a download", () => {
    const element = anchor("/file.mp3");
    element.setAttribute("download", "");
    element.click();
    expect(isNavigationInFlight()).toBe(false);
  });

  it("ignores a jump within the current document", () => {
    anchor("#top").click();
    expect(isNavigationInFlight()).toBe(false);
  });

  it("ignores a click on the current address", () => {
    anchor(`${window.location.pathname}${window.location.search}`).click();
    expect(isNavigationInFlight()).toBe(false);
  });
});
