import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  typescript: {
    // Temporarily ignore type errors during build
    ignoreBuildErrors: true,
  },
};

export default withMDX(nextConfig);
