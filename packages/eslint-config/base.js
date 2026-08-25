import js from "@eslint/js";

export const baseConfig = [
  js.configs.recommended,
  {
    ignores: ["node_modules/*", "dist/*", ".turbo/*"],
  },
];

export default baseConfig;
