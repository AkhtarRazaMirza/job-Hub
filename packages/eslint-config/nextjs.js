import nextConfig from "eslint-config-next";

export const nextJsConfig = [
  ...nextConfig,
  {
    ignores: [".next/*", "node_modules/*", "dist/*"],
  },
];

export default nextJsConfig;
