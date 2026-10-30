import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The vendored Lesan declarations are a generated file; type-checking them is
  // pointless and they are not ours to fix.
  typedRoutes: false,
};

export default nextConfig;
