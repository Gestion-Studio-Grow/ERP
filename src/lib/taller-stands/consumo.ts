// ============================================================================
// TALLER DE STANDS — stock real de materiales (GSG-MIA-004 · T6).
// «Descontar materiales del stock»: por cada línea del despiece cuya pieza tenga un producto que controla stock, una
// salida CONSUMO por el ledger (`recordMovement`, el único que toca `Product.stock`). «Devolver al stock»: una entrada
// REPOSICION (sin costo: no pisa el costo vigente) por lo descontado. Todo en la transacción del llamador.
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

const fmt = (n: number) => String(round3(n)).replace(".", ",");

/** Registra el movimiento por el ledger y devuelve el id de la fila escrita (lo trae la lista de eventos). */
async function mover(tx: Tx, eventos: MovimientoParaEventos[], d: { tenantId: string; productId: string; type: StockMovementType; qty: number; reason: string; autor: string; label: string }): Promise<string> {
  await recordMovement(tx, { tenantId: d.tenantId, productId: d.productId, type: d.type, qty: d.qty, reason: d.reason, createdBy: d.autor, label: d.label, eventos });
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
    await tx.tallerConsumo.upsert({
      where: { proyectoId_piezaId: { proyectoId, piezaId: l.piezaId } },
      create: { tenantId, proyectoId, piezaId: l.piezaId, productId: prod.id, cantidad: round3(l.cantidad), movementId },
      update: { productId: prod.id, cantidad: round3(l.cantidad), movementId },
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
    orderBy: { createdAt: "asc" },
    select: { id: true, productId: true, cantidad: true, pieza: { select: { nombre: true } }, product: { select: { name: true } } },
  });
  const eventos: MovimientoParaEventos[] = [];
  for (const c of consumos) {
    const movementId = await mover(tx, eventos, { tenantId, productId: c.productId, type: "REPOSICION", qty: c.cantidad, reason: `Devolución del stand #${p.numero}: ${c.pieza.nombre}`, autor: d.autor, label: c.product.name });
    // Transición condicional: si la fila cambió (no debería, con el bloqueo), se revierte todo.
    const n = await tx.tallerConsumo.updateMany({ where: { id: c.id, tenantId, cantidad: c.cantidad }, data: { cantidad: 0, movementId } });
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
