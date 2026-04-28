import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Skip generated/external code so the linter doesn't choke on
  // files that don't follow the project's TS conventions.
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "e2e/**",
      "scripts/**",
      "infra/**",
      "next.config.ts",
      "playwright.config.ts",
      "tsconfig.tsbuildinfo",
      "local-appsync-server.js",
    ],
  },
  // typescript-eslint flat config bundles parser + plugin + recommended
  // rules. We stay on the non-typed-checking variant — it doesn't require
  // a per-file program lookup, which keeps lint fast.
  ...tseslint.configs.recommended,
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Honour the `_` prefix convention for intentionally-unused
      // identifiers (e.g. `_request` in Next.js route handlers, destructured
      // siblings we want to drop, caught errors we don't read).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
