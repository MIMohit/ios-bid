import type { NextConfig } from "next";

const config: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.mzstatic.com" }],
  },
};

export default config;
