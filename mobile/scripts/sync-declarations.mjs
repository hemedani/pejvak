import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../back/declarations/selectInp.ts");
const target = resolve(here, "../src/lib/generated/selectInp.ts");

if (!existsSync(source)) {
  console.error(
    `[sync-declarations] Missing ${source}.\n` +
      "Start the backend once (deno task start) so Lesan emits declarations/.",
  );
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`[sync-declarations] ${source} -> ${target}`);
