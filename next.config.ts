import type { NextConfig } from "next";
import path from "path";

const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  // Root fixo do projeto — evita loop de compile quando existe
  // package-lock em C:\Users\canal e o Next escolhe a pasta errada.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
