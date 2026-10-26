import type { NextConfig } from "next";

const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321");

const nextConfig: NextConfig = {
  // Dev server is reached via app./{slug}.localtest.me subdomains.
  allowedDevOrigins: ["*.localtest.me", "localtest.me"],
  images: {
    remotePatterns: [
      {
        protocol: supabase.protocol.replace(":", "") as "http" | "https",
        hostname: supabase.hostname,
        port: supabase.port,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
