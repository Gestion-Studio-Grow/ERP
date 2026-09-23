// Núcleo PURO de AJUSTES / MERMAS de stock (F2) — el tercer flujo que mueve
// inventario, además de la venta (order-core) y la compra/reposición (purchase-core).
//
// Un ajuste corrige el stock por fuera del ciclo venta/compra: recuento físico,
// merma, rotura, vencimiento u otra corrección manual. A diferencia de la compra
// (que siempre SUMA) y la venta (que siempre RESTA), el ajuste lleva un delta
// FIRMADO: puede subir o bajar el stock. Se asienta como StockMovement tipo AJUSTE
// (ver src/lib/stock/ledger.ts) con `reason` OBLIGATORIO — un ajuste sin motivo no
// es auditable, y esa trazabilidad es justamente para qué existe el ledger.
//
// Este archivo es PURO (sin DB, sin tenant): toda la aritmética de signo vive acá
// para poder unit-testearla Y reusarla en el formulario (preview del delta en vivo)
// sin arrastrar Prisma al bundle del cliente. La persistencia está en
// `adjustment-insert.ts`, que se apoya en estos helpers.

import { round3 } from "@/lib/stock/ledger";
import { leerCantidad, type LecturaCantidad } from "@/lib/pos-peso";

// Motivo del ajuste (categoría). Es lo que hace `reason` obligatorio: siempre hay
// uno. Cada motivo fija CÓMO se interpreta el número que carga el operador:
//   RECUENTO    → cuenta física: carga el stock REAL contado (absoluto) y el delta
//                 sale de la diferencia contra el stock del sistema.
//   MERMA/ROTURA/VENCIMIENTO → baja: carga la cantidad PERDIDA (magnitud) y siempre resta.
//   OTRO        → corrección libre: carga el delta FIRMADO (+ suma / − resta); exige nota.
export type AdjustmentMotivo = "RECUENTO" | "MERMA" | "ROTURA" | "VENCIMIENTO" | "OTRO";

export const ADJUSTMENT_MOTIVOS: readonly AdjustmentMotivo[] = [
  "RECUENTO",
  "MERMA",
  "ROTURA",
  "VENCIMIENTO",
  "OTRO",
];

// Etiqueta legible del motivo, para el `reason` persistido y la UI.
export function motivoLabel(m: AdjustmentMotivo): string {
  switch (m) {
    case "RECUENTO":
      return "Recuento";
    case "MERMA":
      return "Merma";
    case "ROTURA":
      return "Rotura";
    case "VENCIMIENTO":
      return "Vencimiento";
    case "OTRO":
      return "Otro";
  }
}

// Cómo se interpreta el valor que carga el operador para cada motivo.
//   COUNT  → valor = stock real contado (absoluto). Delta = contado − actual.
//   LOSS   → valor = cantidad perdida (magnitud). Delta = −|valor| (siempre baja).
//   SIGNED → valor = delta firmado tal cual (+ suma / − resta).
export type AdjustmentMode = "COUNT" | "LOSS" | "SIGNED";

export function motivoMode(m: AdjustmentMotivo): AdjustmentMode {
  switch (m) {
    case "RECUENTO":
      return "COUNT";
    case "MERMA":
    case "ROTURA":
    case "VENCIMIENTO":
      return "LOSS";
    case "OTRO":
      return "SIGNED";
  }
}

// ¿El motivo OTRO exige nota? Sí: es el único sin categoría descriptiva, así que la
// nota es lo que da el "por qué". Para el resto la nota es opcional (el motivo ya
// describe). Espeja la validación de la UI y la de la acción.
export function requiresNote(m: AdjustmentMotivo): boolean {
  return m === "OTRO";
}

// Delta FIRMADO que aplica una línea de ajuste, dado el modo, el valor cargado y el
// stock actual del producto. Puro y testeable. `current` sólo se usa en COUNT
// (recuento); en LOSS/SIGNED se ignora. Redondeado a 3 decimales (stock fraccional).
export function adjustmentDelta(
  mode: AdjustmentMode,
  value: number,
  current: number,
): number {
  if (!Number.isFinite(value)) return 0;
  switch (mode) {
    case "COUNT":
      return round3(value - current);
    case "LOSS":
      return round3(-Math.abs(value));
    case "SIGNED":
      return round3(value);
  }
}

// El `reason` que se persiste en cada movimiento: etiqueta del motivo + nota opcional.
// Nunca vacío (el motivo siempre está) → cumple "reason obligatorio".
export function buildReason(motivo: AdjustmentMotivo, note: string | null): string {
  const n = note?.trim();
  return n ? `${motivoLabel(motivo)} — ${n}` : motivoLabel(motivo);
}

// ── Leer lo que se tipea en cada línea ─────────────────────────────────────
//
// El recuento era un `<input type="number">` leído con `Number()`. Con la coma, el navegador
// se la traga (medido: tipear "4,350" entrega "4350", ver la cabecera de pos-peso.ts), así
// que un recuento de cuatro kilos trescientos cincuenta dejaba el corte en 4350 kg, con un
// AJUSTE "Recuento" por esa diferencia en el ledger (y el preview en verde, porque el delta
// salía positivo). Ahora el
// campo es texto y se lee con la misma regla que el POS (`leerCantidad`, coma y punto valen
// lo mismo, precisión de gramos), en el formulario Y en la Server Action.
//
// La única diferencia con el POS es el SIGNO: en OTRO el número es un delta firmado ("-2,5"
// resta), y `leerCantidad` rechaza el "-" a propósito (no se vende −1 kg). Acá el signo se
// separa antes, y SÓLO en el modo que lo admite: en un recuento o una merma, "-3" sigue
// siendo un error de tipeo y se marca, no se convierte en otra cosa.
export function leerValorDeAjuste(mode: AdjustmentMode, raw: string | null | undefined): LecturaCantidad {
  const s = String(raw ?? "").trim();
  if (mode !== "SIGNED") return leerCantidad(s);
  // "−" (U+2212) es el menos que pega un teclado de celular o un copiar de planilla.
  const m = /^([+\-\u2212])\s*(.*)$/.exec(s);
  if (!m) return leerCantidad(s);
  const l = leerCantidad(m[2]);
  if (l.estado !== "ok") return l.estado === "vacio" ? { estado: "invalida" } : l;
  return { estado: "ok", valor: m[1] === "+" ? l.valor : -l.valor };
}

// Las líneas que llegan a la Server Action (arrays paralelos productId[]/value[]). Misma
// lectura que la pantalla, con una diferencia: lo ilegible LANZA con un mensaje en vez de
// descartarse. Antes un valor que no era número llegaba como NaN y `insertStockAdjustment`
// lo filtraba callado: se registraba el ajuste de las otras líneas y la persona no se
// enteraba de que ésa no había entrado. Una línea sin producto (la fila vacía del final) no
// es un error: no se pidió nada.
export function leerLineasDeAjuste(
  mode: AdjustmentMode,
  productIds: readonly string[],
  values: readonly string[],
): { productId: string; value: number }[] {
  if (productIds.length !== values.length) {
    throw new Error("El ajuste llegó incompleto (productos y valores no coinciden). Volvé a cargarlo.");
  }
  const out: { productId: string; value: number }[] = [];
  productIds.forEach((productId, i) => {
    if (!productId) return;
    const l = leerValorDeAjuste(mode, values[i]);
    if (l.estado === "vacio") {
      throw new Error(`Línea ${i + 1}: falta el valor. Cargalo o quitá la línea.`);
    }
    if (l.estado === "invalida") {
      throw new Error(
        `Línea ${i + 1}: "${String(values[i]).slice(0, 24)}" no es una cantidad. Escribila con coma decimal (4,350).`,
      );
    }
    out.push({ productId, value: l.valor });
  });
  return out;
}

// Qué productos ofrece la pantalla de ajustes: los activos, y además el que llega preelegido
// desde el "Recontar" del catálogo AUNQUE esté inactivo. El catálogo ya no deja tipear el
// stock en la edición (lo pisaba con el número de cuando se abrió la pantalla), así que este
// recuento es el único camino para corregir el stock de un producto dado de baja. Es un
// filtro de Prisma en forma de objeto plano (sin importar Prisma: este módulo lo usa el
// cliente); el loader le suma `tenantId` y `deletedAt: null`.
export function filtroDeAjustables(
  preelegido?: string | null,
): { active: true } | { OR: [{ active: true }, { id: string }] } {
  const id = typeof preelegido === "string" ? preelegido.trim() : "";
  return id ? { OR: [{ active: true }, { id }] } : { active: true };
}
