// ============================================================================
// TALLER DE STANDS — stock real de materiales (GSG-MIA-004 · T6).
// «Descontar materiales del stock»: por cada línea del despiece cuya pieza tenga un producto que controla stock, una
// salida CONSUMO por el ledger (`recordMovement`, el único que toca `Product.stock`). «Devolver al stock»: una entrada
// REPOSICION por lo descontado, al costo al que se descontó (`TallerConsumo.costoTotal`) y con el actor marcado
// (`TALLER_DEVOLUCION_ACTOR_PREFIX`): no es «último ingreso con costo» (stock/costo.ts), resta del costo de insumos del
// mes (reports/costo-vendido.ts) y resta demanda (suppliers/sugerido.ts). Descontar 4 y devolver 4 = neto 0.
// Todo en la transacción del llamador. Las líneas se mueven ORDENADAS por producto: dos proyectos que comparten
// productos toman los candados de `Product` en el mismo orden (sin deadlock 40P01).
//
// Idempotencia, en dos capas: el FOR UPDATE del proyecto pone en fila dos clics simultáneos (el segundo ve lo que dejó
// el primero) y `TallerConsumo` guarda la cantidad NETA descontada por proyecto y pieza (único proyectoId+piezaId).
// Si el despiece cambia después, se descuenta sólo lo que falta; si bajó, NO se devuelve solo: se avisa (la pieza
// puede estar cortada aunque ya no se use). Si la pieza cambió de producto, se avisa y no se mueve nada de esa línea.
// Falta de stock: el ledger tira `RechazoDelStock` y la transacción entera se deshace (nada a medias).
// ============================================================================

import type { Prisma } from "@/generated/prisma/client";
import { recordMovement, round3, type StockMovementType } from "@/lib/stock/ledger";
import { emitirEventosDeMovimientos, type MovimientoParaEventos } from "@/eventos/del-stock";
import { TALLER_DEVOLUCION_ACTOR_PREFIX } from "./actor";

export { TALLER_DEVOLUCION_ACTOR_PREFIX } from "./actor";

type Tx = Prisma.TransactionClient;

export interface ResultadoConsumo {
  ok: boolean;
  motivo?: "NO_EXISTE";
  /** Movimientos de stock registrados (0 = no había nada para hacer). */
  movimientos: number;
  avisos: string[];
}

interface Args {
  tenantId: string;
  proyectoId: string;
  /** Actor del ledger ("user:<id>"). */
  autor: string;
}

/** Bloquea el proyecto (FOR UPDATE): dos descuentos o devoluciones a la vez quedan en fila. */
async function bloquearProyecto(tx: Tx, tenantId: string, proyectoId: string): Promise<{ numero: number } | null> {
  const filas = await tx.$queryRaw<{ numero: number }[]>`
    SELECT "numero" FROM "Proyecto" WHERE "id" = ${proyectoId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  return filas[0] ?? null;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const fmt = (n: number) => String(round3(n)).replace(".", ",");

/** Registra el movimiento por el ledger y devuelve el id de la fila escrita (lo trae la lista de eventos). */
async function mover(tx: Tx, eventos: MovimientoParaEventos[], d: { tenantId: string; productId: string; type: StockMovementType; qty: number; reason: string; autor: string; label: string; unitCost?: number | null }): Promise<string> {
  await recordMovement(tx, { tenantId: d.tenantId, productId: d.productId, type: d.type, qty: d.qty, unitCost: d.unitCost, reason: d.reason, createdBy: d.autor, label: d.label, eventos });
  return eventos[eventos.length - 1]?.movimientoId ?? "";
}

export async function descontarMaterialesTx(tx: Tx, d: Args): Promise<ResultadoConsumo> {
  const { tenantId, proyectoId } = d;
  const p = await bloquearProyecto(tx, tenantId, proyectoId);
  if (!p) return { ok: false, motivo: "NO_EXISTE", movimientos: 0, avisos: [] };
  const lineas = await tx.tallerDespiece.findMany({
    where: { tenantId, proyectoId },
    orderBy: { createdAt: "asc" },
    select: { piezaId: true, cantidad: true, pieza: { select: { nombre: true, product: { select: { id: true, name: true, trackStock: true } } } } },
  });
  // Orden estable por producto (y pieza): los candados de `Product` se toman siempre en el mismo orden.
  lineas.sort((x, y) => cmp(x.pieza.product?.id ?? "", y.pieza.product?.id ?? "") || cmp(x.piezaId, y.piezaId));
  const previos = new Map((await tx.tallerConsumo.findMany({ where: { tenantId, proyectoId }, select: { piezaId: true, productId: true, cantidad: true, pieza: { select: { nombre: true } } } })).map((c) => [c.piezaId, c]));
  const eventos: MovimientoParaEventos[] = [];
  const avisos: string[] = [];
  let movimientos = 0;
  let sinProducto = 0;
  for (const l of lineas) {
    const previo = previos.get(l.piezaId);
    previos.delete(l.piezaId);
    const prod = l.pieza.product;
    if (!prod || !prod.trackStock) {
      sinProducto++;
      continue;
    }
    const ya = previo?.cantidad ?? 0;
    if (previo && ya > 0 && previo.productId !== prod.id) {
      avisos.push(`«${l.pieza.nombre}» cambió de producto después de descontarla: devolvé al stock y volvé a descontar.`);
      continue;
    }
    const falta = round3(l.cantidad - ya);
    if (falta < 0) avisos.push(`De «${l.pieza.nombre}» se descontaron ${fmt(ya)} y el despiece ahora pide ${fmt(l.cantidad)}: si sobraron, devolvelas al stock.`);
    if (falta <= 0) continue;
    const movementId = await mover(tx, eventos, { tenantId, productId: prod.id, type: "CONSUMO", qty: falta, reason: `Stand #${p.numero}: ${l.pieza.nombre}`, autor: d.autor, label: prod.name });
    movimientos++;
    // El costo de ESTA salida: el que el ledger estampó en la fila (costo vigente del momento). Si quedó null es que no
    // había costo vigente: cuenta $0 acá, y el reporte costea la salida y su devolución con el costo de hoy (neto 0).
    const fila = movementId ? await tx.stockMovement.findFirst({ where: { id: movementId, tenantId }, select: { unitCost: true } }) : null;
    const costo = falta * (fila?.unitCost && fila.unitCost > 0 ? fila.unitCost : 0);
    await tx.tallerConsumo.upsert({
      where: { proyectoId_piezaId: { proyectoId, piezaId: l.piezaId } },
      create: { tenantId, proyectoId, piezaId: l.piezaId, productId: prod.id, cantidad: round3(l.cantidad), costoTotal: costo, movementId },
      update: { productId: prod.id, cantidad: round3(l.cantidad), costoTotal: { increment: costo }, movementId },
    });
  }
  for (const c of previos.values()) {
    if (c.cantidad > 0) avisos.push(`«${c.pieza.nombre}» ya no está en el despiece pero se descontaron ${fmt(c.cantidad)}: si sobraron, devolvelas al stock.`);
  }
  if (sinProducto > 0 && movimientos === 0 && avisos.length === 0) avisos.push(`${sinProducto === 1 ? "Una pieza no tiene" : `${sinProducto} piezas no tienen`} un producto que controle stock: vinculalo en el catálogo de piezas.`);
  await emitirEventosDeMovimientos(tx, eventos);
  return { ok: true, movimientos, avisos };
}

export async function devolverMaterialesTx(tx: Tx, d: Args): Promise<ResultadoConsumo> {
  const { tenantId, proyectoId } = d;
  const p = await bloquearProyecto(tx, tenantId, proyectoId);
  if (!p) return { ok: false, motivo: "NO_EXISTE", movimientos: 0, avisos: [] };
  const consumos = await tx.tallerConsumo.findMany({
    where: { tenantId, proyectoId, cantidad: { gt: 0 } },
    select: { id: true, productId: true, piezaId: true, cantidad: true, costoTotal: true, pieza: { select: { nombre: true } }, product: { select: { name: true } } },
  });
  // Mismo orden que al descontar (por producto, comparado en JS y no con la collation de la base).
  consumos.sort((x, y) => cmp(x.productId, y.productId) || cmp(x.piezaId, y.piezaId));
  const eventos: MovimientoParaEventos[] = [];
  for (const c of consumos) {
    // Vuelve al costo al que salió (promedio de lo descontado); sin costo conocido, sin costo (como la salida).
    const unitCost = c.costoTotal > 0 ? c.costoTotal / c.cantidad : null;
    const movementId = await mover(tx, eventos, { tenantId, productId: c.productId, type: "REPOSICION", qty: c.cantidad, unitCost, reason: `Devolución del stand #${p.numero}: ${c.pieza.nombre}`, autor: `${TALLER_DEVOLUCION_ACTOR_PREFIX}${d.autor}`, label: c.product.name });
    // Transición condicional: si la fila cambió (no debería, con el bloqueo), se revierte todo.
    const n = await tx.tallerConsumo.updateMany({ where: { id: c.id, tenantId, cantidad: c.cantidad }, data: { cantidad: 0, costoTotal: 0, movementId } });
    if (n.count !== 1) throw new Error("El consumo cambió mientras se devolvía: no se movió el stock.");
  }
  await emitirEventosDeMovimientos(tx, eventos);
  return { ok: true, movimientos: consumos.length, avisos: [] };
}

/** Mensaje en criollo del resultado, para el aviso de la pantalla. PURA. */
export function mensajeConsumo(r: ResultadoConsumo, accion: "descontar" | "devolver"): string {
  if (!r.ok) return "Ese proyecto no existe.";
  const extra = r.avisos.length ? ` ${r.avisos.join(" ")}` : "";
  if (accion === "devolver") return r.movimientos ? `Materiales devueltos al stock (${r.movimientos} ${r.movimientos === 1 ? "producto" : "productos"}).` : "No había materiales descontados para devolver.";
  if (r.movimientos) return `Materiales descontados del stock (${r.movimientos} ${r.movimientos === 1 ? "movimiento" : "movimientos"}).${extra}`;
  return `No había nada nuevo para descontar.${extra}`;
}
