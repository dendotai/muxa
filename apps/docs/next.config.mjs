import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/muxa',
  assetPrefix: '/muxa',
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