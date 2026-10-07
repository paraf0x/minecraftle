/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async headers() {
    return [
      {
        // matching all API routes
        source: "/api/:path*",
        headers: [
          // { key: "Access-Control-Allow-Credentials", value: "true" },
          {
            key: "Access-Control-Allow-Origin",
            value: "http://127.0.0.1:5000",
          }, // replace this your actual origin
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,DELETE,PATCH,POST,PUT,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          // LFS: Discord embeds the game in an iframe, so X-Frame-Options
          // SAMEORIGIN is replaced by a frame-ancestors list.
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
