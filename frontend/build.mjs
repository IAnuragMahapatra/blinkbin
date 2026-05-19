// esbuild script — bundles tlock-js + drand-client into vendor/timelock.bundle.js
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "fs";

//  timelock bundle
await esbuild.build({
  entryPoints: ["build-entry/timelock-entry.js"],
  bundle: true,
  outfile: "vendor/timelock.bundle.js",
  format: "iife",
  globalName: "tlock",
  platform: "browser",
  target: ["es2020"],
  // WASM: if mcl-wasm or noble-bls needs WASM, mark external and handle separately
  // If bundling fails with WASM errors, try: loader: { ".wasm": "dataurl" }
  loader: { ".wasm": "dataurl" },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  logLevel: "info",
});

console.log("✓ timelock.bundle.js built");
