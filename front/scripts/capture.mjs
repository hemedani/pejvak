/**
 * Visual QA capture for the Pejvak web console.
 *
 * Drives the locally installed Google Chrome through `playwright-core`, signs in
 * with the demo listener, and writes light/dark, desktop/mobile and
 * reduced-motion screenshots under `artifacts/`. It never downloads a browser:
 * `channel: "chrome"` is deliberate, so the harness works offline after the
 * package install.
 *
 * The server is not started here. Run `npm run dev` first, then `npm run capture`.
 */

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const BASE = (process.env.CAPTURE_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL ?? "demo@pejvak.app";
const PASSWORD = process.env.E2E_PASSWORD ?? "password123";
const OUT = new URL("../artifacts/", import.meta.url).pathname;

const ROUTES = ["/login", "/", "/library", "/history", "/playlists", "/settings", "/player", "/browse"];
const VIEWPORTS = [
  { tag: "desktop", width: 1440, height: 900 },
  { tag: "mobile", width: 390, height: 844 },
];
const SCHEMES = ["light", "dark"];

function slug(route) {
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/login`);
      if (response.ok) return;
    } catch {
      // The dev server is still compiling; retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No server at ${BASE}/login. Start it with: env NODE_OPTIONS= npm run dev`);
}

async function newContext(browser, viewport, scheme, reduced) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: scheme,
    reducedMotion: reduced ? "reduce" : "no-preference",
    deviceScaleFactor: 1,
  });
  await context.addCookies([{ name: "theme", value: scheme, url: BASE }]);
  return context;
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !new URL(url).pathname.startsWith("/login"), { timeout: 30000 });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
}

async function captureRoute(page, route, viewport, scheme, reduced) {
  await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 30000 });

  // The shell streams before the page: the route component can still be replacing
  // its skeleton, and `.page-enter` starts at `opacity: 0` on hydration. A
  // screenshot taken on `load` alone catches either frame and looks like an empty
  // page. Wait for the route's content and for the entrance to settle.
  await page.waitForFunction(
    () => {
      const main = document.querySelector("main");
      return Boolean(main && (main.textContent ?? "").trim().length > 0);
    },
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => {
      const entering = document.querySelector(".page-enter");
      return !entering || Number(getComputedStyle(entering).opacity) === 1;
    },
    undefined,
    { timeout: 10000 },
  );
  await page.waitForTimeout(120);

  // The Next dev tools pill is not part of the product and lands on top of the
  // mobile player controls and the library table in a full-page shot.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

  const name = `${slug(route)}-${viewport.tag}-${scheme}${reduced ? "-reduced" : ""}.png`;
  await page.screenshot({ path: `${OUT}${name}`, fullPage: true, timeout: 30000 });
  console.log(`  ${name}`);
  return name;
}

async function capturePass(browser, viewport, scheme, reduced) {
  const context = await newContext(browser, viewport, scheme, reduced);
  const page = await context.newPage();
  const files = [];
  const suffix = `${viewport.tag}/${scheme}${reduced ? "/reduced" : ""}`;
  console.log(`Pass ${suffix}`);

  try {
    // /login is captured signed out, then the same context signs in for the rest.
    files.push(await captureRoute(page, "/login", viewport, scheme, reduced));
    await signIn(page);

    for (const route of ROUTES.filter((item) => item !== "/login")) {
      files.push(await captureRoute(page, route, viewport, scheme, reduced));
    }
  } catch (error) {
    await page
      .screenshot({ path: `${OUT}login-failed-${viewport.tag}-${scheme}.png`, fullPage: true })
      .catch(() => {});
    throw new Error(
      `Pass ${suffix} failed: ${error.message}\n` +
        `If the form stayed on /login, sign-in was rejected. Set E2E_EMAIL and E2E_PASSWORD to a working account.`,
    );
  } finally {
    await context.close();
  }

  return files;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await waitForServer();

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const captured = [];

  try {
    for (const scheme of SCHEMES) {
      for (const viewport of VIEWPORTS) {
        captured.push(...(await capturePass(browser, viewport, scheme, false)));
      }
    }

    captured.push(...(await capturePass(browser, VIEWPORTS[0], "light", true)));
  } finally {
    await browser.close();
  }

  console.log(`Captured ${captured.length} screenshots into ${OUT}`);
  for (const name of captured) console.log(`  ${name}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
