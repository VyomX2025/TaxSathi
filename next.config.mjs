/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep heavy server-only deps external for reliable API route bundles on Vercel
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

export default nextConfig;
