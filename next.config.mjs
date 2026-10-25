/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allows isolated verification builds (NEXT_DIST_DIR=.next-verify) so a
  // production build never clobbers a running `next dev`'s .next cache.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
