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
    // buscatufoto: exportación compilada (JS minificado) y su fuente, que tiene su propio lint.
    "src/tenants/buscatufoto/sitio/**",
    "celula-negocios-digitales/buscatufoto/**",
    // Copia estática de sitios de terceros (WordPress, jQuery y plugins minificados) que se sirve tal cual.
    "public/tenants/*/sitio/**",
    // Evidencia de QA archivada (arneses y fotos del «antes» de cada arreglo): no es código que corre.
    ".qa/**",
  ]),
  // Scripts de Node en CommonJS por diseño (hooks de Claude Code): `require` es su forma de importar.
  {
    files: ["**/*.cjs", ".claude/hooks/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
