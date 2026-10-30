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
import { ETIQUETA_DE_COLUMNA } from "@/lib/caja/cierre-diario";
import type { CashMethod } from "@/lib/caja/cash-register";

/**
 * De dónde se lee el arqueo de una fila del cierre. `porColumna` es la hoja que se contó (lo que se
 * vio y se tipeó); `porMedio`, el libro. Con F2 no coinciden (Transferencia abre en 0; la hoja
 * nueva abre MP sin lo de transferencia), así que manda `porColumna` cuando está (cert. M1 v9 O1).
 * Las filas viejas sólo traen `porMedio`. Las etiquetas son las de la hoja: «Mercado Pago» en la
 * nueva, «MP / Transf.» en la de siempre (`hoja: "siempre"`) y en las filas viejas. PURA.
 */
export function arqueoDeLaFila(changes: unknown): { fuente: Record<string, unknown>; etiquetas: Record<CashMethod, string> } | null {
  if (typeof changes !== "object" || changes === null) return null;
  const c = changes as Record<string, unknown>;
  const deLaHoja = typeof c.porColumna === "object" && c.porColumna !== null;
  const fuente = deLaHoja ? c.porColumna : c.porMedio;
  if (typeof fuente !== "object" || fuente === null) return null;
  const etiquetas = deLaHoja && c.hoja !== "siempre" ? ETIQUETA_DE_COLUMNA : CASH_METHOD_LABEL;
  return { fuente: fuente as Record<string, unknown>, etiquetas };
}

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
  const arqueo = arqueoDeLaFila(changes);
  if (!arqueo) return null;
  const c = changes as Record<string, unknown>;

  const estado = typeof c.estado === "string" ? (ESTADO_LABEL[c.estado] ?? c.estado) : null;
  const movimientos = esNumero(c.movimientos) ? c.movimientos : null;

  const partes: string[] = [];
  if (movimientos !== null) partes.push(`${movimientos} movimiento${movimientos === 1 ? "" : "s"}`);
  if (estado) partes.push(estado);

  const medios: string[] = [];
  for (const k of CASH_METHODS) {
    const m = arqueo.fuente[k];
    if (typeof m !== "object" || m === null) continue;
    const { esperado, declarado, diferencia } = m as Record<string, unknown>;
    if (!esNumero(esperado)) continue;
    const label = arqueo.etiquetas[k as CashMethod];
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
