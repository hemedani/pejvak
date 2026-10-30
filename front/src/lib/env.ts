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
 * The backend base URL, trailing slash stripped.
 *
 * `lesanApi` posts to `URL` verbatim, so a trailing slash produces
 * `http://host//` — which the backend's router does not match. Stripping here
 * means the value in `.env.local` can be pasted from a browser address bar.
 */
export function backendUrl(): string {
  return required("BACKEND_URL").replace(/\/+$/, "");
}
