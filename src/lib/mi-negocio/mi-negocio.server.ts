// ============================================================================
// MI NEGOCIO — lecturas del servidor (no son endpoints: las llaman páginas y acciones que ya pasaron
// su guardia; el `tenantId` sale de la sesión del que llama).
// ============================================================================
//
// CÓMO LO ENCHUFA LA INTEGRACIÓN EN LOS WHATSAPP (mensajes-whatsapp.ts no se toca acá):
//
//   // en el loader de la pantalla (servidor), una vez por pedido:
//   const { alias } = await cargarReglasDelMostrador(tenantId);
//   // y se pasa al componente que arma el mensaje, en lugar de la constante:
//   <AltaDeTurno … alias={alias} />                         // AltaDeTurno ya recibe `alias` (default: la constante)
//   mensajePedidoDeSenia({ …, alias })                      // TurnoCajon / lista-core de clientes
//
// `alias` = el alias de Mi negocio, si no el CBU, y si no hay ninguno (o la migración M2 no está
// aplicada) `ALIAS_SENIA_PROVISIONAL` (hoy `null`: el pedido de seña sale sin alias, nunca con uno
// inventado). Ver `aliasParaMensajes` en mi-negocio.ts.

import { tenantTransaction } from "@/lib/rls";
import { leerReglasDelNegocio, type ReglasDelNegocio } from "@/lib/settings";
import { ALIAS_SENIA_PROVISIONAL } from "@/lib/turnos/mensajes-whatsapp";
import { aliasParaMensajes } from "./mi-negocio";

export type ReglasDelMostrador = { reglas: ReglasDelNegocio; alias: string | null };

/** Las reglas de Mi negocio (o el placeholder D2/D5 sin la migración) y el alias para los WhatsApp. */
export async function cargarReglasDelMostrador(tenantId: string): Promise<ReglasDelMostrador> {
  const reglas = await tenantTransaction((tx) => leerReglasDelNegocio(tenantId, tx), { tenantId });
  return { reglas, alias: aliasParaMensajes(reglas, ALIAS_SENIA_PROVISIONAL) };
}
