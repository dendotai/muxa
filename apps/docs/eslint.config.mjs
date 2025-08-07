import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      ".worker-next/**",
      "node_modules/**",
      ".open-next/**",
      ".wrangler/**",
      "out/**",
      "dist/**",
      "build/**",
      ".source/**",
      "coverage/**",
    ],
  },
];

export default config;
