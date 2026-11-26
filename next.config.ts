import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Bundle pg: under `bun --bun next dev`, Bun cannot resolve the hashed alias Turbopack creates for externals.
  transpilePackages: ["pg"],
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Room for a 4 MB Knowledge base file import plus its multipart
      // overhead, while staying under Vercel's 4.5 MB request body limit.
      bodySizeLimit: "4.25mb",
    },
  },
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
