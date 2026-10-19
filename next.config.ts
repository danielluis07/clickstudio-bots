import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Bundle pg: under `bun --bun next dev`, Bun cannot resolve the hashed alias Turbopack creates for externals.
  transpilePackages: ["pg"],
  partialPrefetching: true,
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
