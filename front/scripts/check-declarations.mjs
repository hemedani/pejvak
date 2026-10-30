#!/usr/bin/env node
/**
 * Guards the vendored Lesan declarations against drift (plan §2 C6).
 *
 * `back/declarations/selectInp.ts` is generated on backend start
 * (`typeGeneration: true`). `front/` keeps a byte-identical copy because the
 * request and response types are the contract, and a *near*-identical copy is
 * worse than none: the types would compile while the wire format had moved on,
 * so the lie would surface as a runtime `undefined` three screens later.
 *
 * Byte-for-byte, not "semantically equal". A diff that only reformats still
 * means the backend regenerated the file, and the next real change would arrive
 * with no signal that anything had happened.
 *
 * Exit codes:
 *   0 — identical
 *   1 — drifted, or one side is missing (prints a diff)
 *   2 — only the source exists (backend regenerated, front never re-vendored)
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const SOURCE = resolve(root, "../back/declarations/selectInp.ts");
const VENDORED = resolve(root, "src/types/declarations/selectInp.ts");

const rel = (p) => relative(process.cwd(), p) || p;

function readOrNull(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

const source = readOrNull(SOURCE);
const vendored = readOrNull(VENDORED);

if (source === null && vendored === null) {
  console.error(
    `✗ Neither the backend declarations nor the vendored copy exist.\n` +
      `  expected: ${rel(SOURCE)}\n` +
      `  expected: ${rel(VENDORED)}`,
  );
  process.exit(1);
}

if (source === null) {
  // `front/` can be checked out on its own (a deploy, a fresh clone of a
  // split repo). The vendored copy is then the only truth there is, and it is
  // a committed artefact — not a failure.
  console.log(
    `• Backend declarations not present (${rel(SOURCE)}); using the vendored copy as-is.`,
  );
  process.exit(0);
}

if (vendored === null) {
  console.error(
    `✗ ${rel(VENDORED)} is missing.\n` +
      `  Run: cp ${rel(SOURCE)} ${rel(VENDORED)}`,
  );
  process.exit(2);
}

const digest = (text) => createHash("sha256").update(text).digest("hex");
const sourceHash = digest(source);
const vendoredHash = digest(vendored);

if (sourceHash === vendoredHash) {
  console.log(`✓ Declarations in sync (sha256 ${sourceHash.slice(0, 12)}).`);
  process.exit(0);
}

console.error(
  [
    `✗ Vendored declarations have drifted from the backend.`,
    `    backend : ${rel(SOURCE)}  sha256 ${sourceHash.slice(0, 12)}`,
    `    vendored: ${rel(VENDORED)}  sha256 ${vendoredHash.slice(0, 12)}`,
    ``,
    `  The backend regenerates this file on start. Re-vendor it, then fix every`,
    `  type error the new declarations produce — those errors are the reason the`,
    `  check exists.`,
    ``,
    `  Run: cp ${rel(SOURCE)} ${rel(VENDORED)}`,
    ``,
    `  First differing line:`,
    `  ${firstDifference(source, vendored)}`,
  ].join("\n"),
);
process.exit(1);

/** `a.ts:12 ≠ b.ts:12` — enough to see which act moved without a diff tool. */
function firstDifference(a, b) {
  const left = a.split("\n");
  const right = b.split("\n");
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    if (left[i] !== right[i]) {
      return `${i + 1}: ${truncate(left[i])} ≠ ${truncate(right[i])}`;
    }
  }
  return "none (lengths differ only by trailing newline)";
}

function truncate(line) {
  const text = line === undefined ? "<end of file>" : line.trim();
  return text.length > 96 ? `${text.slice(0, 96)}…` : text || "<blank>";
}
