import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 标记 Node 原生模块为 server-external,避免被 webpack 打包出错
  serverExternalPackages: [
    "better-sqlite3",
    "isomorphic-git",
    "adm-zip",
    "bcryptjs",
  ],
  // 上传体积放宽到 100MB(HTML 原型 zip)
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  // HTML 原型托管路由的安全 header
  async headers() {
    return [
      {
        source: "/proto/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
