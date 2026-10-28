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

import { emitirEvento, tieneSql, type ResultadoEmision } from "./emitir";

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

/** ¿Este movimiento cruza el mínimo hacia abajo? PURA. */
export function cruzaElMinimo(m: Pick<MovimientoParaEventos, "delta" | "saldo" | "minimo" | "controlaStock">): boolean {
  if (!m.controlaStock || m.delta >= 0 || m.minimo === null || m.minimo === undefined) return false;
  const antes = m.saldo - m.delta;
  return m.saldo <= m.minimo && antes > m.minimo;
}

type TxProducto = {
  product: {
    findFirst(args: { where: { id: string; tenantId: string }; select: { name: true; codigo: true } }): Promise<{ name: string; codigo: string | null } | null>;
  };
};

/** Emite lo que corresponda a un movimiento del ledger. Devuelve lo que se emitió (para los tests). */
export async function emitirEventosDelMovimiento(tx: object, m: MovimientoParaEventos): Promise<ResultadoEmision[]> {
  if (!tieneSql(tx) || !m.movimientoId) return [];
  const salida: ResultadoEmision[] = [];
  if (m.tipo === "AJUSTE" && m.delta !== 0) {
    salida.push(
      await emitirEvento(tx, {
        tenantId: m.tenantId,
        tipo: "stock.ajustado",
        version: 1,
        clave: `stock:movimiento:${m.movimientoId}`,
        datos: { productoId: m.productId, delta: m.delta, motivo: m.motivo ?? "", movimientoId: m.movimientoId },
      }),
    );
  }
  if (cruzaElMinimo(m)) {
    const p = await (tx as unknown as TxProducto).product.findFirst({
      where: { id: m.productId, tenantId: m.tenantId },
      select: { name: true, codigo: true },
    });
    if (p) {
      salida.push(
        await emitirEvento(tx, {
          tenantId: m.tenantId,
          tipo: "stock.bajo",
          version: 1,
          clave: `stock:${m.productId}:bajo:${m.movimientoId}`,
          datos: { productoId: m.productId, sku: p.codigo || null, nombre: p.name, disponible: m.saldo, minimo: Number(m.minimo) },
        }),
      );
    }
  }
  return salida;
}
