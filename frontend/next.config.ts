import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Keep Turbopack scoped to this application. A package-lock.json higher in
  // Downloads previously made Next choose the wrong workspace root, which can
  // produce stale/mismatched development chunks after a rebuild.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
