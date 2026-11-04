/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allows isolated verification builds (NEXT_DIST_DIR=.next-verify) so a
  // production build never clobbers a running `next dev`'s .next cache.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // About and Contact are now sections of the home page; keep old links working.
  async redirects() {
    return [
      { source: "/about", destination: "/#about", permanent: true },
      { source: "/contact", destination: "/#contact", permanent: true },
    ];
  },
  experimental: {
    // Studio → Quiz Master: firebase-admin (and its gRPC/protobuf deps) must
    // stay a plain Node require, not be bundled by webpack.
    serverComponentsExternalPackages: ["firebase-admin"],
    // The Quiz Master prompts and seed bank are read with fs at runtime;
    // make sure they ship with the routes that use them.
    outputFileTracingIncludes: {
      "/api/admin/quizmaster/**/*": ["./src/lib/quizmaster/assets/**/*"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
