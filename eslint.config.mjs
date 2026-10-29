import { fileURLToPath } from "node:url";

import { includeIgnoreFile } from "@eslint/compat";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Whatever git ignores isn't the app's code: build output, local design
  // and reference folders.
  includeIgnoreFile(
    fileURLToPath(new URL(".gitignore", import.meta.url)),
    "Files git ignores",
  ),
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent sessions' worktrees: full copies of this repository.
    ".claude/**",
  ]),
]);

export default eslintConfig;
