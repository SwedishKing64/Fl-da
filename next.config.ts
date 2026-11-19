import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The build a page was opened with, so it can tell when the site has moved on. See UpdateBanner.
  env: { NEXT_PUBLIC_BUILD: process.env.VERCEL_GIT_COMMIT_SHA || "dev" },
  // The desktop app runs the server as a folder of its own (see scripts/desktop-build.mjs).
  ...(process.env.FLODA_DESKTOP_BUILD ? { output: "standalone" as const } : {}),
  // Ship the SQLite template used when no database is configured (see scripts/vercel-build.mjs),
  // and Prisma's engine, which the tracer does not always follow.
  outputFileTracingIncludes: { "/*": ["prisma/template.db", "node_modules/.prisma/client/*.node", "node_modules/.prisma/client/schema.prisma"] },
  experimental: {
    serverActions: {
      /**
       * An instruction sheet is sent to the server to be read — a PDF, or a photo of a printed
       * page, which is routinely two or three megabytes. Server Actions cap the request body at
       * 1MB by default, and base64 adds a third again on top, so anything but a small text file
       * would have been rejected.
       *
       * This is only for that sheet. The catalogue exports on the same page are far bigger and
       * never travel: they are read, changed and saved in the browser.
       */
      bodySizeLimit: "12mb",
    },
  },
  async redirects() {
    // The importer used to live under /catalog; keep old links working.
    return [
      { source: "/catalog", destination: "/", permanent: true },
      { source: "/catalog/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
