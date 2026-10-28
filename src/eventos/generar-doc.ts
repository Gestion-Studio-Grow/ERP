// Escribe docs/integrations/eventos.md desde el catálogo:  npx tsx src/eventos/generar-doc.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { generarDocEventos } from "./doc";

export const RUTA_DOC_EVENTOS = path.join(process.cwd(), "docs", "integrations", "eventos.md");

writeFileSync(RUTA_DOC_EVENTOS, generarDocEventos());
console.log(`Escrito ${path.relative(process.cwd(), RUTA_DOC_EVENTOS)}`);
