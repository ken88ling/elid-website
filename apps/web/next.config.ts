import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  transpilePackages: ["@app/shared"],
  partialPrefetching: true,
  experimental: {
    instantInsights: {
      // Signed-in pages are client-rendered behind a client-side session, so only
      // validate segments that explicitly opt in with `export const instant`.
      validationLevel: "manual-warning",
    },
  },
  // Proxy the Hono API so the browser calls it same-origin (session cookie, no CORS).
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
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
