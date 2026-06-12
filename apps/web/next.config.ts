import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker: copy .next/standalone là đủ chạy production
  output: 'standalone',
  poweredByHeader: false,
  images: {
    remotePatterns: [
      // Avatar Google OAuth
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
};

export default nextConfig;
