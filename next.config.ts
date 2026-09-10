import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the SQLite template used when no database is configured (see scripts/vercel-build.mjs).
  outputFileTracingIncludes: { "/*": ["prisma/template.db"] },
  async redirects() {
    // The importer used to live under /catalog; keep old links working.
    return [
      { source: "/catalog", destination: "/", permanent: true },
      { source: "/catalog/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
