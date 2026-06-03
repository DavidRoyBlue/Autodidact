import baseConfig from "../../packages/config/eslint.config.base.mjs";

export default [
  ...baseConfig,
  {
    ignores: ["vitest.config.ts"],
  },
];
