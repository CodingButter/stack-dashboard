/**
 * Bundle the custom server entry (src/server/entry.ts) to a single ESM file
 * `dist-server/server.mjs`. The deploy script copies this into the standalone
 * output as the ExecStart target.
 *
 * `next` is kept external — it must resolve from the standalone's traced
 * node_modules at runtime (it's a huge tree Next assembles itself). Everything
 * else, including `ws` and our own app code (reachable via the `@/` alias, e.g.
 * the governor parser), IS bundled in — so the standalone tree needs nothing
 * beyond `next` for the custom server to boot.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [resolve(root, "src/server/entry.ts")],
  outfile: resolve(root, "dist-server/server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Resolve the `@/*` path alias the app uses.
  alias: { "@": resolve(root, "src") },
  // Only `next` stays external (resolved from the standalone's traced tree).
  // `ws` and everything else are inlined so the standalone needs no extra deps.
  external: ["next"],
  // ESM output that uses require() (from bundled CJS deps) needs this shim.
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      "const require = __cr(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});

console.log("built dist-server/server.mjs");
