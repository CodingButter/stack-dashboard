import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production build: emits `.next/standalone/server.js` with a
  // minimal traced node_modules, so the web service runs on plain `node` with
  // no pnpm/workspace at runtime. See deploy/stackdash-web.service.
  output: "standalone",
  // Dev-only: allow accessing the dev server from other machines by
  // hostname/tailnet IP (Next blocks cross-origin dev resources by default).
  allowedDevOrigins: ["bigbeast", "100.88.169.30", "10.0.0.213"],
};

export default nextConfig;
