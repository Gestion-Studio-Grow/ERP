// ============================================================================
// stock.bajo@1 y stock.ajustado@1 — los eventos del ledger de stock (P2-C2)
// ============================================================================
//
// El ÚNICO mutador de `Product.stock` es `recordMovement` (src/lib/stock/ledger.ts): toda venta,
// compra, consumo y ajuste pasa por ahí, dentro de la transacción del llamador. Ahí se emite, con
// una sola línea, en esa misma transacción: si la venta o el ajuste vuelve atrás, el evento también.
//
// Archivo aparte de del-core.ts a propósito: ledger.ts lo importa un formulario del navegador
// (RecuentoForm, por `round3`), y esto sólo arrastra el emisor puro (sin Prisma, sin node:).
//
//   · stock.ajustado: todo movimiento AJUSTE (recuento con diferencia, merma). El recuento que
//     coincide con el sistema (`registrarConteoSinDiferencia`, cantidad 0) no ajusta nada: no emite.
//   · stock.bajo: sólo cuando ESTE movimiento CRUZA el mínimo (antes > mínimo, después <= mínimo)
//     en un producto que controla stock. Cada venta por debajo del mínimo no vuelve a avisar: el
//     aviso es «se cruzó la línea», y vuelve a sonar sólo si una entrada lo sube y otra lo baja.
// ============================================================================

import { emitirEventosEnLote, tieneSql, type EventoDelCatalogo, type ResultadoEmision } from "./emitir";

export interface MovimientoParaEventos {
  tenantId: string;
  productId: string;
  /** Id de la fila de StockMovement recién escrita. */
  movimientoId: string;
  tipo: string;
  /** Delta firmado aplicado al stock. */
  delta: number;
  /** Stock después del movimiento (balanceAfter). */
  saldo: number;
  motivo: string | null;
  /** `Product.lowStockAt` y `Product.trackStock` leídos en la misma tx. */
  minimo: number | null | undefined;
  controlaStock: boolean | null | undefined;
}

/** Al milésimo, como `round3` del ledger (no se importa: ledger.ts importa este archivo). */
function alMilesimo(n: number): number {
  return Math.round(n * 1000) / 1000 + 0;
}

/**
 * ¿Este movimiento cruza el mínimo hacia abajo? PURA. `antes` se redondea al milésimo, como el
 * saldo: `5 - (-0.1)` da 5.1000000000000005 y, con el stock justo en el mínimo, volvía a avisar
 * (O-v5-3, CERT-P2).
 */
export function cruzaElMinimo(m: Pick<MovimientoParaEventos, "delta" | "saldo" | "minimo" | "controlaStock">): boolean {
  if (!m.controlaStock || m.delta >= 0 || m.minimo === null || m.minimo === undefined) return false;
  const antes = alMilesimo(m.saldo - m.delta);
  return m.saldo <= m.minimo && antes > m.minimo;
}

type TxProductos = {
  product: {
    findMany(args: { where: { id: { in: string[] }; tenantId: string }; select: { id: true; name: true; codigo: true } }): Promise<{ id: string; name: string; codigo: string | null }[]>;
  };
};

/**
 * Emite lo que corresponda a varios movimientos del ledger (de UN negocio), EN LOTE (F7, CERT-P2
 * vuelta 5): un recuento de 500 líneas son tres sentencias en el outbox, no tres por línea. Por
 * movimiento, en este orden: `stock.ajustado` (si es un AJUSTE con diferencia) y `stock.bajo` (si
 * cruza el mínimo). Devuelve lo que se emitió (para los tests).
 */
export async function emitirEventosDeMovimientos(tx: object, movimientos: readonly MovimientoParaEventos[]): Promise<ResultadoEmision[]> {
  const ms = movimientos.filter((m) => m.movimientoId);
  if (!tieneSql(tx) || ms.length === 0) return [];
  const bajan = ms.filter(cruzaElMinimo);
  const porTenant = new Map<string, Set<string>>();
  for (const m of bajan) porTenant.set(m.tenantId, (porTenant.get(m.tenantId) ?? new Set()).add(m.productId));
  const productos = new Map<string, { name: string; codigo: string | null }>();
  for (const [tenantId, ids] of porTenant) {
    const filas = await (tx as unknown as TxProductos).product.findMany({
      where: { id: { in: [...ids] }, tenantId },
      select: { id: true, name: true, codigo: true },
    });
    for (const f of filas) productos.set(`${tenantId}:${f.id}`, f);
  }

  const eventos: EventoDelCatalogo[] = [];
  for (const m of ms) {
    if (m.tipo === "AJUSTE" && m.delta !== 0) {
      eventos.push({
        tenantId: m.tenantId,
        tipo: "stock.ajustado",
        version: 1,
        clave: `stock:movimiento:${m.movimientoId}`,
        datos: { productoId: m.productId, delta: m.delta, motivo: m.motivo ?? "", movimientoId: m.movimientoId },
      });
    }
    const p = cruzaElMinimo(m) ? productos.get(`${m.tenantId}:${m.productId}`) : undefined;
    if (p) {
      eventos.push({
        tenantId: m.tenantId,
        tipo: "stock.bajo",
        version: 1,
        clave: `stock:${m.productId}:bajo:${m.movimientoId}`,
        datos: { productoId: m.productId, sku: p.codigo || null, nombre: p.name, disponible: m.saldo, minimo: Number(m.minimo) },
      });
    }
  }
  return emitirEventosEnLote(tx, eventos);
}

/** Emite lo que corresponda a UN movimiento del ledger. Devuelve lo que se emitió (para los tests). */
export async function emitirEventosDelMovimiento(tx: object, m: MovimientoParaEventos): Promise<ResultadoEmision[]> {
  return emitirEventosDeMovimientos(tx, [m]);
}
