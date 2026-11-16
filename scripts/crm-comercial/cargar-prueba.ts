// Carga la prueba del CRM comercial en UN negocio (idempotente; todo queda anotado «de prueba»).
//   npx tsx scripts/crm-comercial/cargar-prueba.ts --negocio <slug> [--leads archivo] [--clientes archivo] [--lote nombre]
// Rechaza una DATABASE_URL de Neon. Requiere el interruptor y los miembros del CRM (Dirección, comerciales, puestos).
import "dotenv/config";
import { cargarPrueba, LOTE_POR_DEFECTO } from "../../src/lib/crm-comercial/carga-prueba";
import { leerArchivos, NEGOCIO_POR_DEFECTO, salir, texto } from "./comun";

async function main() {
  const slug = texto("negocio", NEGOCIO_POR_DEFECTO);
  const { leads, clientes } = leerArchivos(slug);
  const informe = await cargarPrueba({ slug, leads, clientes, lote: texto("lote", LOTE_POR_DEFECTO) });
  salir(informe);
}
main().catch((e) => salir({ ok: false, motivo: e instanceof Error ? e.message : String(e) }, 1));
