import type { NextConfig } from "next";

/**
 * Set NEXT_OUTPUT=export to produce a fully static build in out/, which is what
 * IPFS-backed hosts such as 4EVERLAND serve. The app has no API routes and no
 * server-rendered data fetching, so nothing is lost by exporting statically:
 * every page reads the chain from the browser.
 */
const isStaticExport = process.env.NEXT_OUTPUT === "export";

/**
 * Safe{Wallet} loads /verifier as a custom Safe App only after fetching its
 * manifest and icon from its own origin, so those two files must allow
 * cross-origin reads. A static export can't set headers: configure the same
 * on the host instead.
 */
const safeAppHeaders = [
  {
    source: "/verifier/:file(manifest\\.json|icon\\.svg)",
    headers: [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Access-Control-Allow-Methods", value: "GET" },
      { key: "Access-Control-Allow-Headers", value: "X-Requested-With, content-type, Authorization" },
    ],
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,

  ...(isStaticExport ? {} : { headers: async () => safeAppHeaders }),

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
