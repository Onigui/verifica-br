import type { NextConfig } from "next";

const config: NextConfig = {
  // Pacotes do monorepo são consumidos como TypeScript-fonte.
  transpilePackages: ["@verifica-br/core", "@verifica-br/db", "@verifica-br/ai"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default config;
