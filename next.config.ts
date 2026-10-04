import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Threads also support environments that restrict child-process creation.
  experimental: { workerThreads: true, cpus: 2, webpackBuildWorker: false, useTypeScriptCli: false },
};
export default nextConfig;
