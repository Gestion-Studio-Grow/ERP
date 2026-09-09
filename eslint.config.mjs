import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Productos aislados del Core: son ESM plano con su propio runner de tests y
    // no participan del pipeline del ERP. Mismo criterio que el "exclude" de
    // tsconfig.json — que el aislamiento sea estructural y no dependa de qué
    // extensión de archivo se use.
    "productos/**",
  ]),
]);

export default eslintConfig;
