import type { NextConfig } from "next";

const isGitHubPages = process.env.DEPLOY_TARGET === "github";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: "export",
        basePath: "/abesekkotsuin",
        assetPrefix: "/abesekkotsuin/",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }),
};

export default nextConfig;
