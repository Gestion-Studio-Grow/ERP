"use server";

// STUB 1-B: lo reemplaza 1-A
// ============================================================================
// CERRAR TURNOS EN LOTE — la acción de la bandeja «Cerrar lo pendiente».
// ============================================================================
//
// Versión mínima para que la bandeja (agente 1-B) funcione en su rama: recorre los ítems de a uno
// y reusa las acciones de siempre (`completeAppointment`, `markNoShow`, `cerrarTurnoSinPrestar`),
// cada una con su propia transacción, su guardia de permisos y su predicado `tenantId`. Un ítem que
// falla no frena a los demás. La de verdad (con `planCierreEnLote` y `vino` para los Reservados) la
// escribe 1-A con la MISMA firma; al integrar gana la suya.
//
// El formulario: `items` = JSON de `{ id, accion: "vino" | "dejar-saldo" | "no-vino", method?,
// senia?: "retener" | "devolver", cobrarHoy?: boolean }[]` (lo arma `formularioDeLote` en
// src/app/admin/(dashboard)/turnos/cerrar/cerrar-core.ts). Tope: 50 ítems.

import { cerrarTurnoSinPrestar, completeAppointment, markNoShow } from "@/lib/actions";

const TOPE = 50;

type Item = { id: string; accion: string; method?: string; senia?: string; cobrarHoy?: boolean };

function leerItems(fd: FormData): Item[] {
  try {
    const crudo = JSON.parse(String(fd.get("items") ?? "[]"));
    if (!Array.isArray(crudo)) return [];
    return crudo.filter((x): x is Item => !!x && typeof x.id === "string" && typeof x.accion === "string");
  } catch {
    return [];
  }
}

export async function cerrarTurnosEnLote(fd: FormData): Promise<{ resultados: { id: string; ok: boolean; error?: string }[] }> {
  const items = leerItems(fd);
  if (items.length > TOPE) {
    return { resultados: items.map((i) => ({ id: i.id, ok: false, error: `Se cierran hasta ${TOPE} por vez. Marcá menos.` })) };
  }
  const resultados: { id: string; ok: boolean; error?: string }[] = [];
  for (const item of items) {
    const f = new FormData();
    f.set("appointmentId", item.id);
    try {
      let r: { ok: true; aviso?: string } | { ok: false; error: string };
      if (item.accion === "no-vino") {
        if (item.senia) {
          f.set("accion", "no-vino");
          f.set("senia", item.senia);
          r = await cerrarTurnoSinPrestar(f);
        } else {
          r = await markNoShow(f);
        }
      } else if (item.accion === "vino" || item.accion === "dejar-saldo") {
        f.set("vino", "on");
        if (item.accion === "dejar-saldo") f.set("saldo", "a-cobrar");
        else if (item.method) f.set("method", item.method);
        r = await completeAppointment(f);
      } else {
        r = { ok: false, error: "No entendimos qué hacer con ese turno. Recargá la pantalla." };
      }
      resultados.push(r.ok ? { id: item.id, ok: true } : { id: item.id, ok: false, error: r.error });
    } catch {
      resultados.push({ id: item.id, ok: false, error: "No se pudo cerrar. Probá de nuevo; si sigue, avisá." });
    }
  }
  return { resultados };
}
