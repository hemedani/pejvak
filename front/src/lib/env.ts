/**
 * Server configuration.
 *
 * Read once, validated once. A missing `BACKEND_URL` should fail at the first
 * request with a sentence that names the variable, not with `fetch("undefined/")`
 * and a `TypeError` three layers down.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and set it to the Pejvak backend's base URL (e.g. http://localhost:1405).`,
    );
  }
  return value;
}

/**
 * The Lesan endpoint, built from the backend base URL.
 *
 * `lesanApi` posts to `URL` verbatim, and Lesan only routes its acts at
 * `/lesan`; posting to the bare origin answers "Expected POST to /lesan, got
 * POST to /". Accepting either form means the value in `.env.local` can be
 * pasted from the backend's startup banner or a browser address bar.
 */
export function backendUrl(): string {
  const base = required("BACKEND_URL").replace(/\/+$/, "");
  return base.endsWith("/lesan") ? base : `${base}/lesan`;
}
