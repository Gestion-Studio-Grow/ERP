"use server";

// STUB 1-B: lo reemplaza 1-A
// ============================================================================
// CERRAR TURNOS EN LOTE — la acción de la bandeja «Cerrar lo pendiente».
// ============================================================================
//
// Misma firma que `cerrarTurnosEnLote` de la rama `reing-ch-t1a` (1-A):
// `(fd: FormData) => Promise<ResultadoDelLote>`, con `items` = JSON de `PedidoDeCierre[]`
// (`formDataDelLote`, cierre-lote.ts). Versión mínima para que la bandeja funcione en su rama:
// recorre las líneas de a una y reusa las acciones de siempre (`completeAppointment`,
// `markNoShow`, `cerrarTurnoSinPrestar`), cada una con su transacción, su guardia de permisos y su
// predicado `tenantId`. Una línea que falla no frena a las demás. La de 1-A (con
// `planCierreEnLote` y `vino` para los Reservados) gana al integrar.

import { requireCapability } from "@/lib/authz";
import { cerrarTurnoSinPrestar, completeAppointment, markNoShow, type ResultadoAccion } from "@/lib/actions";
import { CAMPO_DEL_LOTE, TOPE_DEL_LOTE, type PedidoDeCierre, type ResultadoDeLinea, type ResultadoDelLote } from "./cierre-lote";

export type { ResultadoDelLote, ResultadoDeLinea } from "./cierre-lote";

function leer(raw: unknown): PedidoDeCierre[] | null {
  if (typeof raw !== "string") return null;
  try {
    const datos: unknown = JSON.parse(raw);
    if (!Array.isArray(datos)) return null;
    return datos.filter(
      (x): x is PedidoDeCierre =>
        !!x && typeof x.id === "string" && (x.accion === "vino" || x.accion === "debe" || x.accion === "no-vino"),
    );
  } catch {
    return null;
  }
}

export async function cerrarTurnosEnLote(fd: FormData): Promise<ResultadoDelLote> {
  await requireCapability("agenda:complete");
  const pedidos = leer(fd.get(CAMPO_DEL_LOTE));
  if (!pedidos || pedidos.length === 0) return { resultados: [], error: "No llegó ningún turno para cerrar." };
  if (pedidos.length > TOPE_DEL_LOTE) {
    return { resultados: [], error: `Se cierran hasta ${TOPE_DEL_LOTE} turnos por vez. Marcá menos y repetí.` };
  }
  const resultados: ResultadoDeLinea[] = [];
  for (const p of pedidos) {
    const f = new FormData();
    f.set("appointmentId", p.id);
    try {
      let r: ResultadoAccion;
      if (p.accion === "no-vino") {
        if (p.senia) {
          f.set("accion", "no-vino");
          f.set("senia", p.senia);
          r = await cerrarTurnoSinPrestar(f);
        } else {
          r = await markNoShow(f);
        }
      } else {
        f.set("vino", "on");
        if (p.accion === "debe") f.set("saldo", "a-cobrar");
        else if (p.method) f.set("method", p.method);
        r = await completeAppointment(f);
      }
      resultados.push(r.ok ? { id: p.id, ok: true, ...(r.aviso ? { aviso: r.aviso } : {}) } : { id: p.id, ok: false, error: r.error });
    } catch {
      resultados.push({ id: p.id, ok: false, error: "No se pudo cerrar este turno. Probá de nuevo en un rato o cerralo desde la agenda." });
    }
  }
  return { resultados };
}
