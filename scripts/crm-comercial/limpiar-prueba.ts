// Limpia la prueba del CRM comercial de UN negocio: borra SÓLO lo anotado «de prueba» (y lo que cuelga de sus
// oportunidades). Por defecto es un simulacro (--dry-run): corre todo y lo deshace, para ver las cifras.
//   npx tsx scripts/crm-comercial/limpiar-prueba.ts --negocio <slug>            → simulacro
//   npx tsx scripts/crm-comercial/limpiar-prueba.ts --negocio <slug> --aplicar  → borra
// Rechaza una DATABASE_URL de Neon.
import "dotenv/config";
import { limpiarPrueba } from "../../src/lib/crm-comercial/carga-prueba";
import { argumento, salir, texto } from "./comun";

async function main() {
  const slugArg = argumento("negocio");
  if (typeof slugArg !== "string") salir({ ok: false, motivo: "Falta --negocio <slug>: la limpieza no adivina el negocio." }, 1);
  const aplicar = argumento("aplicar") === true && argumento("dry-run") === undefined;
  salir(await limpiarPrueba({ slug: texto("negocio", ""), aplicar }));
}
main().catch((e) => salir({ ok: false, motivo: e instanceof Error ? e.message : String(e) }, 1));
