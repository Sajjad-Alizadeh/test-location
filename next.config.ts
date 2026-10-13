import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
      { key: "Cache-Control", value: "no-store" },
    ] }];
  },
};
export default nextConfig;
