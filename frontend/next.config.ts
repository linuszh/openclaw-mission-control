import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In dev, Next may proxy requests based on the request origin/host.
  // Allow common local origins so `next dev --hostname 127.0.0.1` works
  // when users access via http://localhost:3000 or http://127.0.0.1:3000.
  // Keep the LAN IP as well for dev on the local network.
  allowedDevOrigins: ["192.168.1.101", "localhost", "127.0.0.1", "claudecode.drum-royal.ts.net"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://127.0.0.1:8000/api/v1/:path*",
      },
      {
        source: "/health",
        destination: "http://127.0.0.1:8000/health",
      },
      {
        source: "/healthz",
        destination: "http://127.0.0.1:8000/healthz",
      },
      {
        source: "/readyz",
        destination: "http://127.0.0.1:8000/readyz",
      },
    ];
  },
};

export default nextConfig;
