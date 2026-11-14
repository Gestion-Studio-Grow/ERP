// ============================================================================
// MANTENIMIENTO GSG — la huella del borrador que se aprueba (D5/D6, MANT-003 vuelta adversarial 1). PURO.
// ============================================================================
//
// Aprobar un borrador va atado a SU CONTENIDO, no a una marca que pone quien lo escribe: antes la
// «versión» era `borradorIa.el`, y el agente (que escribe `borradorIa` directo) podía cambiar el texto
// dejando el mismo `el`; la persona aprobaba algo que no había visto. Ahora la versión es una huella
// sha256 de lo que la ficha MUESTRA (tipo, prioridad, respuesta y motivo, ya leídos como los lee la
// ficha) más `el`, calculada en el servidor: la ficha manda la huella de lo que mostró y la aprobación
// la recalcula sobre la fila bloqueada (FOR UPDATE). Cualquier cambio de contenido → otra huella → rechazo.
// Sólo servidor (node:crypto): no lo importa ningún componente de cliente.

import { createHash } from "node:crypto";

export interface ContenidoDelBorrador {
  tipo: string;
  prioridad: string;
  respuesta: string;
  motivo: string;
  /** La hora del borrador (`borradorIa.el`); "" si no tiene. */
  el: string;
}

/**
 * Huella hex (sha256) del contenido. Se serializa como arreglo JSON en orden fijo: sin separadores
 * ambiguos («a|b» + «c» ≠ «a» + «b|c»). PURA y determinista.
 */
export function huellaDelBorrador(b: ContenidoDelBorrador): string {
  return createHash("sha256").update(JSON.stringify(["borrador-v1", b.tipo, b.prioridad, b.respuesta, b.motivo, b.el])).digest("hex");
}
