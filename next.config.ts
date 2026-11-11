import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["pg", "node:sqlite"],
  poweredByHeader: false,
};
export default config;
