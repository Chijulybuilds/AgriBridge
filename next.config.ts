import type { NextConfig } from "next";

/**
 * Set NEXT_OUTPUT=export to produce a fully static build in out/, which is what
 * IPFS-backed hosts such as 4EVERLAND serve. The app has no API routes and no
 * server-rendered data fetching, so nothing is lost by exporting statically:
 * every page reads the chain from the browser through Wagmi and talks to the
 * backend over CORS.
 */
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,

  ...(isStaticExport
    ? {
        output: "export" as const,
        // IPFS gateways serve directories, so each route needs its own
        // index.html rather than a sibling .html file.
        trailingSlash: true,
        // The image optimizer needs a server; there is none behind a static export.
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
