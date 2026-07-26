import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: allow accessing the dev server from other machines by
  // hostname/tailnet IP (Next blocks cross-origin dev resources by default).
  allowedDevOrigins: ["bigbeast", "100.88.169.30", "10.0.0.213"],
};

export default nextConfig;
