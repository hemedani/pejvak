// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Reanimated's API is *built around* mutating `sharedValue.value` from
    // gesture and animation callbacks. The React Compiler's `immutability` rule
    // models React state and props, not animation handles, so it reports every
    // legitimate shared-value write as "this value cannot be modified".
    //
    // `refs` misfires for the same reason, one step removed. A gesture callback
    // handed to `Gesture.Pan().onStart(...)` is stored and invoked by the
    // gesture handler, never during render — but the rule cannot see that, and
    // because the callback reaches a JS-side ref through `scheduleOnRN` (the
    // worklet → JS bridge, which exists precisely because refs are not
    // reachable from the UI thread) it reads the whole chain as a render-time
    // ref access.
    //
    // Scope both rules off for the animation layer only — the screens and
    // domain modules still get the full check.
    files: [
      "src/components/motion/**/*.{ts,tsx}",
      "src/components/player/**/*.{ts,tsx}",
      "src/components/ui/glass/**/*.{ts,tsx}",
    ],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
]);
