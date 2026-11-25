import type { NextConfig } from "next";
import { securityHeaders } from "./server/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Bundle pg: under `bun --bun next dev`, Bun cannot resolve the hashed alias Turbopack creates for externals.
  transpilePackages: ["pg"],
  partialPrefetching: true,
  headers: async () => [
    {
      source: "/:path*",
      headers: securityHeaders({ development: process.env.NODE_ENV === "development" }),
    },
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
