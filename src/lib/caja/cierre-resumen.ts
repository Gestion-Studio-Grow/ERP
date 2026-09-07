// El cierre de caja, contado en una línea legible.
//
// La fila de `AuditLog` del cierre no es un rastro técnico: es EL REGISTRO DEL ARQUEO
// del día (esperado, contado y diferencia por medio quedan en `changes`, ver
// frontera-cierre.ts). En la pantalla de auditoría, mostrarla como un volcado de JSON
// la vuelve inútil justo para quien la necesita: la dueña buscando qué pasó el martes.
//
// PURA y testeada: no sabe de React ni de la base. Tolera un `changes` incompleto o de
// otra forma —es JSON de la base, escrito por una versión anterior del código— y en ese
// caso devuelve null para que la pantalla caiga al volcado de siempre.

import { CASH_METHODS, CASH_METHOD_LABEL } from "@/lib/caja/libro-caja";
import type { CashMethod } from "@/lib/caja/cash-register";

const ESTADO_LABEL: Record<string, string> = {
  CUADRA: "cuadró",
  SOBRANTE: "sobró plata",
  FALTANTE: "faltó plata",
  MIXTO: "sobró en un medio y faltó en otro",
  SIN_DECLARAR: "sin conciliar",
};

function money(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function esNumero(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/**
 * Una línea por medio: qué esperaba el libro, qué se contó y cómo cerró.
 * Devuelve `null` si el `changes` no tiene la forma del cierre (así la pantalla
 * puede caer al volcado crudo en vez de mostrar algo a medias).
 */
export function resumenCierre(changes: unknown): { titulo: string; medios: string[]; nota: string | null } | null {
  if (typeof changes !== "object" || changes === null) return null;
  const c = changes as Record<string, unknown>;
  const porMedio = c.porMedio;
  if (typeof porMedio !== "object" || porMedio === null) return null;

  const estado = typeof c.estado === "string" ? (ESTADO_LABEL[c.estado] ?? c.estado) : null;
  const movimientos = esNumero(c.movimientos) ? c.movimientos : null;

  const partes: string[] = [];
  if (movimientos !== null) partes.push(`${movimientos} movimiento${movimientos === 1 ? "" : "s"}`);
  if (estado) partes.push(estado);

  const medios: string[] = [];
  for (const k of CASH_METHODS) {
    const m = (porMedio as Record<string, unknown>)[k];
    if (typeof m !== "object" || m === null) continue;
    const { esperado, declarado, diferencia } = m as Record<string, unknown>;
    if (!esNumero(esperado)) continue;
    const label = CASH_METHOD_LABEL[k as CashMethod];
    if (!esNumero(declarado)) {
      medios.push(`${label}: sin conciliar (el libro decía ${money(esperado)})`);
      continue;
    }
    const d = esNumero(diferencia) ? diferencia : declarado - esperado;
    const cola =
      d === 0
        ? "cuadra"
        : d > 0
          ? `sobran ${money(Math.abs(d))}`
          : `faltan ${money(Math.abs(d))}`;
    medios.push(`${label}: contó ${money(declarado)} sobre ${money(esperado)} · ${cola}`);
  }
  if (medios.length === 0) return null;

  const nota = typeof c.note === "string" && c.note.trim() ? c.note.trim() : null;
  return { titulo: partes.join(" · "), medios, nota };
}
