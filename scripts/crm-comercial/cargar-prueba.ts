// Carga la prueba del CRM comercial en UN negocio (idempotente; todo queda anotado «de prueba»).
//   npx tsx scripts/crm-comercial/cargar-prueba.ts --negocio <slug> [--leads archivo] [--clientes archivo] [--lote nombre] [--produccion]
// Rechaza una DATABASE_URL de Neon salvo con --produccion Y CRM_PRUEBA_CONFIRMO_NEGOCIO=<slug> igual al --negocio
// (`guardaDeBase`). Requiere el interruptor y los miembros del CRM (Dirección, comerciales, puestos).
import "dotenv/config";
import { cargarPrueba, LOTE_POR_DEFECTO } from "../../src/lib/crm-comercial/carga-prueba";
import { argumento, leerArchivos, NEGOCIO_POR_DEFECTO, salir, texto } from "./comun";

async function main() {
  const produccion = argumento("produccion") === true;
  // Contra la base publicada el negocio no tiene valor por defecto: se nombra.
  if (produccion && typeof argumento("negocio") !== "string") salir({ ok: false, motivo: "Con --produccion hace falta --negocio <slug>." }, 1);
  const slug = texto("negocio", NEGOCIO_POR_DEFECTO);
  const { leads, clientes } = leerArchivos(slug);
  const informe = await cargarPrueba({ slug, leads, clientes, lote: texto("lote", LOTE_POR_DEFECTO), produccion });
  salir(informe);
}
main().catch((e) => salir({ ok: false, motivo: e instanceof Error ? e.message : String(e) }, 1));
