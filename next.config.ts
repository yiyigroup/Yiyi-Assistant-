import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Legacy v5 HTML lived under repo-root dist/ and used meta-refresh / worker
  // rewrite of "/" → "/orders.html". Keep those files only under legacy/ and
  // never publish them as the Preview home. If a stale bookmark hits a legacy
  // path, send it to the Next.js auth-gated app.
  async redirects() {
    return [
      { source: "/orders.html", destination: "/", permanent: false },
      { source: "/shipping.html", destination: "/", permanent: false },
      { source: "/index.html", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
