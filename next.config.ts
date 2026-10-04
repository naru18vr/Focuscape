import type { NextConfig } from "next";

const pages = process.env.GITHUB_PAGES === "true";
const basePath = pages ? "/Focuscape" : "";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: pages ? "export" : undefined,
  basePath,
  trailingSlash: pages,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Threads also support environments that restrict child-process creation.
  experimental: { workerThreads: true, cpus: 2, webpackBuildWorker: false, useTypeScriptCli: false },
};
export default nextConfig;
