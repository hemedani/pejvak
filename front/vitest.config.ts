import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real package throws outside a React Server environment by design.
      // The adapter tests run its pure mapping rules in Node, so only the
      // guard's runtime is stubbed — `next build` still enforces it.
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    // The tested surface is pure logic — session math, folding, formatting, the
    // dashboard's folds. A DOM is only needed once the player exists (§12).
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
  },
});
