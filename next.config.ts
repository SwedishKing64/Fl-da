import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The importer used to live under /catalog; keep old links working.
    return [
      { source: "/catalog", destination: "/", permanent: true },
      { source: "/catalog/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
