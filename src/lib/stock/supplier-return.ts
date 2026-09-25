// ============================================================================
// DEVOLUCIÓN A PROVEEDOR (D4, ADR-060) — todas las líneas en UNA transacción.
// ============================================================================
//
// Devolver mercadería a un proveedor tiene DOS efectos que deben pasar juntos o ninguno:
//  (a) STOCK: sale del inventario → un movimiento `DEVOLUCION_PROVEEDOR` por línea, al costo
//      de la compra de origen (rastro `purchaseId`).
//  (b) PLATA: el crédito va a algún lado. O se DESCUENTA DE LA DEUDA de esa compra (un
//      Collection PAYABLE que baja el saldo), o el proveedor lo REINTEGRA y entra a la caja
//      (un INGRESO en el libro, por el medio que devolvió), o queda sin reintegro por ahora
//      (el proveedor repone la mercadería, por ejemplo): la persona elige.
//
// POR QUÉ UNA SOLA TRANSACCIÓN. Antes cada línea corría en la suya: con tres líneas y la
// tercera sin stock, las dos primeras ya habían salido y la devolución quedaba a medias sin
// que nadie lo viera. Y una línea inválida se salteaba callada. Ahora se VALIDAN TODAS primero
// (`validarDevolucion`, pura): si alguna no sirve, no se escribe nada y vuelve el error de
// cada línea. Recién con todas válidas se mueve el stock y se asienta el crédito, en la misma
// transacción SERIALIZABLE (el saldo de la deuda lo comparten cobros y pagos concurrentes).
//
// NOTA DE CRÉDITO. El crédito contra la deuda sigue viajando como Collection con método
// TRANSFERENCIA porque el enum `PaymentMethod` no tiene "nota de crédito" (agregarlo es una
// migración). La nota del movimiento empieza con `NOTA_DE_CREDITO_PREFIX`, que es lo que
// distingue un crédito de un pago de verdad.

import { tenantTransaction } from "@/lib/rls";
import { prisma } from "@/lib/prisma";
import { Prisma, type $Enums } from "@/generated/prisma/client";
import { recordMovement } from "@/lib/stock/ledger";
import { applyCollectionInTx } from "@/lib/settlement/collection-repo";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { REINTEGRO_ACTOR_PREFIX, diaContableDelEgreso } from "@/lib/stock/purchase-egreso";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { round2 } from "@/lib/round";
import { leerCantidad } from "@/lib/pos-peso";
import type { CashMethod } from "@/lib/caja/cash-register";

/** Así empieza la nota del Collection que acredita una devolución contra la deuda. */
export const NOTA_DE_CREDITO_PREFIX = "Nota de crédito por devolución a proveedor";

/** Marca de `createdBy` del ingreso de caja por un reintegro del proveedor (vive en purchase-egreso.ts, que es puro). */
export { REINTEGRO_ACTOR_PREFIX };

/** Adónde va la plata de la devolución. */
export type DestinoDelCredito = { tipo: "deuda" } | { tipo: "caja"; method: CashMethod } | { tipo: "ninguno" };

/** Una línea como llega del formulario: el producto y lo que se tipeó. */
export type LineaPedida = { productId: string; cantidad: string };

/** Una línea de la compra de origen, con lo que ya se devolvió y el stock de hoy. */
export type LineaDeCompra = {
  productId: string;
  nombre: string;
  unidad: string;
  comprado: number;
  unitCost: number;
  yaDevuelto: number;
  stock: number;
};

export type LineaValida = { productId: string; nombre: string; qty: number; unitCost: number };
export type ErrorDeLinea = { productId: string; mensaje: string };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n);

/**
 * Las devoluciones a proveedor del negocio (movimientos `DEVOLUCION_PROVEEDOR`), desde `desde` si
 * se da. El mismo `where` para el historial de la pantalla y para "$ devuelto este mes" del
 * Inicio. PURA.
 */
export function whereDevoluciones(tenantId: string, desde?: Date) {
  return { tenantId, type: "DEVOLUCION_PROVEEDOR" as const, ...(desde ? { createdAt: { gte: desde } } : {}) };
}

/**
 * Las líneas de una compra, UNA por producto, con lo ya devuelto y el stock de hoy. La misma
 * compra puede traer un producto en dos líneas (dos cajas a distinto precio): se suma lo
 * comprado y el costo es el PROMEDIO PONDERADO de las dos. Antes quedaba el de la última
 * línea, y con eso se valuaban el crédito contra la deuda y el reintegro en caja. PURA.
 */
export function lineasPorProducto(
  items: readonly { productId: string | null; name: string; unit: string; quantity: number; unitCost: number }[],
  yaDevuelto: ReadonlyMap<string, number>,
  stock: ReadonlyMap<string, number>,
): LineaDeCompra[] {
  const acc = new Map<string, { nombre: string; unidad: string; comprado: number; pagado: number }>();
  for (const i of items) {
    if (!i.productId) continue;
    const prev = acc.get(i.productId);
    acc.set(i.productId, {
      nombre: prev?.nombre ?? i.name,
      unidad: prev?.unidad ?? i.unit,
      comprado: (prev?.comprado ?? 0) + i.quantity,
      pagado: (prev?.pagado ?? 0) + i.quantity * i.unitCost,
    });
  }
  return [...acc.entries()].map(([productId, a]) => ({
    productId,
    nombre: a.nombre,
    unidad: a.unidad,
    comprado: r3(a.comprado),
    unitCost: a.comprado > 0 ? Math.round((a.pagado / a.comprado) * 1e6) / 1e6 : 0,
    yaDevuelto: yaDevuelto.get(productId) ?? 0,
    stock: stock.get(productId) ?? 0,
  }));
}

/**
 * Valida TODAS las líneas de una devolución antes de escribir nada. PURA.
 * Una línea sin cantidad no se pidió (no es error). Es error: que no sea una cantidad, que el
 * producto no esté en esa compra, que esté dos veces, que pase lo que queda por devolver de
 * esa compra (comprado − ya devuelto) o lo que hay en stock hoy.
 */
export function validarDevolucion(
  pedidas: readonly LineaPedida[],
  compra: readonly LineaDeCompra[],
): { ok: true; lineas: LineaValida[] } | { ok: false; errores: ErrorDeLinea[] } {
  const porProducto = new Map(compra.map((l) => [l.productId, l]));
  const vistos = new Set<string>();
  const lineas: LineaValida[] = [];
  const errores: ErrorDeLinea[] = [];
  for (const p of pedidas) {
    const lectura = leerCantidad(p.cantidad);
    if (lectura.estado === "vacio") continue;
    const l = porProducto.get(p.productId);
    if (!l) {
      errores.push({ productId: p.productId, mensaje: "Ese producto no está en esta compra." });
      continue;
    }
    if (vistos.has(p.productId)) {
      errores.push({ productId: p.productId, mensaje: `${l.nombre} está dos veces: dejá una sola línea.` });
      continue;
    }
    vistos.add(p.productId);
    if (lectura.estado === "invalida") {
      errores.push({ productId: p.productId, mensaje: `"${p.cantidad.slice(0, 16)}" no es una cantidad. Escribila con coma (1,5).` });
      continue;
    }
    const qty = lectura.valor;
    const queda = Math.max(0, r3(l.comprado - l.yaDevuelto));
    if (!(qty > 0)) {
      errores.push({ productId: p.productId, mensaje: "La cantidad tiene que ser mayor que cero." });
    } else if (qty > queda) {
      errores.push({
        productId: p.productId,
        mensaje:
          queda === 0
            ? `De ${l.nombre} ya se devolvió todo lo de esta compra.`
            : `De esta compra quedan ${fmt(queda)} ${l.unidad} de ${l.nombre} para devolver.`,
      });
    } else if (qty > r3(l.stock)) {
      errores.push({
        productId: p.productId,
        mensaje: `Hay ${fmt(Math.max(0, l.stock))} ${l.unidad} de ${l.nombre} en stock: no se puede devolver más de lo que hay. Si el stock está mal, recontalo primero.`,
      });
    } else {
      lineas.push({ productId: l.productId, nombre: l.nombre, qty, unitCost: l.unitCost });
    }
  }
  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, lineas };
}

/** Lo que vale la devolución: Σ cantidad × costo de la compra. PURA. */
export function valorDeLaDevolucion(lineas: readonly LineaValida[]): number {
  return round2(lineas.reduce((s, l) => s + l.qty * l.unitCost, 0));
}

/** La devolución no se registró: los errores por línea (o uno general) y NADA escrito. */
export class DevolucionRechazada extends Error {
  readonly errores: ErrorDeLinea[];
  constructor(mensaje: string, errores: ErrorDeLinea[] = []) {
    super(mensaje);
    this.name = "DevolucionRechazada";
    this.errores = errores;
  }
}

export interface DevolucionInput {
  purchaseId: string;
  motivo: string | null;
  lineas: readonly LineaPedida[];
  destino: DestinoDelCredito;
  /** Actor "user:<id>". */
  by: string;
}

export interface DevolucionRegistrada {
  code: number;
  lineas: number;
  total: number;
  destino: DestinoDelCredito["tipo"];
  /** Saldo de la deuda después del crédito (sólo destino "deuda"). */
  saldoDeuda: number | null;
}

/**
 * Registra una devolución completa (todas sus líneas y el crédito) en UNA transacción
 * serializable. Todo lo que decide se lee ADENTRO: la compra (costo y cantidad de cada línea),
 * lo ya devuelto de esa compra, el stock de hoy y la deuda. Si una línea no sirve, lanza
 * `DevolucionRechazada` con el error de cada una y no queda nada escrito.
 */
export async function registrarDevolucion(tenantId: string, input: DevolucionInput): Promise<DevolucionRegistrada> {
  return tenantTransaction(
    (tx) => registrarDevolucionEnTx(tx, tenantId, input),
    // Serializable: la pata de plata comparte el saldo de la deuda con pagos concurrentes, y el
    // tope "comprado − ya devuelto" con otra devolución de la misma compra.
    { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/**
 * La devolución DENTRO de la transacción del llamador. Separada de `registrarDevolucion` para
 * ejecutarla en los tests contra un doble de transacción (supplier-return.test.ts): todo o nada,
 * el costo promedio de la compra y el reintegro en caja se prueban con esta función real.
 */
export async function registrarDevolucionEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: DevolucionInput,
): Promise<DevolucionRegistrada> {
  const compra = await tx.stockPurchase.findFirst({
    where: { id: input.purchaseId, tenantId, kind: "COMPRA" },
    select: {
      id: true,
      code: true,
      supplier: true,
      items: { select: { productId: true, name: true, unit: true, quantity: true, unitCost: true } },
    },
  });
  if (!compra) throw new DevolucionRechazada("Esa compra no existe en este negocio. Elegí otra de la lista.");

  const ids = [...new Set(compra.items.flatMap((i) => (i.productId ? [i.productId] : [])))];
  const [devuelto, productos] = await Promise.all([
    tx.stockMovement.groupBy({
      by: ["productId"],
      where: { tenantId, type: "DEVOLUCION_PROVEEDOR", purchaseId: compra.id, productId: { in: ids } },
      _sum: { qty: true },
    }),
    tx.product.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, stock: true } }),
  ]);
  const yaDevuelto = new Map(devuelto.map((g) => [g.productId ?? "", Math.abs(g._sum.qty ?? 0)]));
  const stock = new Map(productos.map((p) => [p.id, p.stock]));

  // La compra puede tener el mismo producto en dos líneas: se suman, a costo promedio.
  const porProducto = lineasPorProducto(compra.items, yaDevuelto, stock);

  const v = validarDevolucion(input.lineas, porProducto);
  if (!v.ok) throw new DevolucionRechazada("Hay líneas que no se pueden devolver. No se registró nada.", v.errores);
  if (v.lineas.length === 0) throw new DevolucionRechazada("Cargá la cantidad a devolver de al menos un producto.");

  const reason = input.motivo?.trim() ? `Devolución a proveedor — ${input.motivo.trim()}` : "Devolución a proveedor";
  for (const l of v.lineas) {
    await recordMovement(tx, {
      tenantId,
      productId: l.productId,
      type: "DEVOLUCION_PROVEEDOR",
      qty: l.qty,
      unitCost: l.unitCost, // el costo con que entró: la devolución lo revierte
      reason,
      purchaseId: compra.id,
      createdBy: input.by,
      label: l.nombre,
    });
  }

  const total = valorDeLaDevolucion(v.lineas);
  let saldoDeuda: number | null = null;
  if (input.destino.tipo === "deuda" && total > 0) {
    const deuda = await tx.accountPayable.findFirst({
      where: { tenantId, purchaseId: compra.id, status: "OPEN" },
      select: { id: true, amount: true },
    });
    if (!deuda) {
      throw new DevolucionRechazada(
        "Esta compra no tiene una deuda abierta para descontarle. Elegí que el proveedor devuelve la plata, o sin reintegro.",
      );
    }
    let res: Awaited<ReturnType<typeof applyCollectionInTx>>;
    try {
      res = await applyCollectionInTx(tx, tenantId, {
        originType: "PAYABLE",
        originId: deuda.id,
        totalCharged: deuda.amount.toNumber(),
        amount: total,
        method: "TRANSFERENCIA" as $Enums.PaymentMethod, // sin "nota de crédito" en el enum: ver cabecera
        note: `${NOTA_DE_CREDITO_PREFIX} — compra #${compra.code}${input.motivo?.trim() ? ` (${input.motivo.trim()})` : ""}`,
        collectedBy: input.by,
      });
    } catch (err) {
      // La guarda de saldo de la deuda (no se acredita más de lo que se debe). El mensaje
      // de adentro es técnico; éste dice qué hacer. Nada quedó escrito: aborta la transacción.
      if (err instanceof Error && err.message.startsWith("Movimiento rechazado")) {
        throw new DevolucionRechazada(
          `La devolución vale $${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(total)} y es más de lo que queda por pagar de esta compra. ` +
            "Elegí que el proveedor te devuelve la plata, o devolvé menos.",
        );
      }
      throw err;
    }
    saldoDeuda = res.settlement.balance;
  } else if (input.destino.tipo === "caja" && total > 0) {
    // El proveedor devolvió la plata: entra al libro de caja hoy (o el primer día abierto,
    // si hoy ya se cerró), enganchada al turno abierto si hay uno, como el egreso de una
    // compra (purchase-core.ts).
    const dia = diaContableDelEgreso(todayInBusinessTz(), await lastClosedDayTx(tx, tenantId));
    const turno = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
    await tx.cashMovement.create({
      data: {
        tenantId,
        sessionId: turno?.id ?? null,
        type: "INGRESO",
        method: input.destino.method,
        amount: total,
        reason: `Reintegro por devolución a proveedor — compra #${compra.code}${compra.supplier ? ` (${compra.supplier.slice(0, 40)})` : ""}`,
        occurredAt: businessWallTimeToUtc(dia, "12:00"),
        createdBy: `${REINTEGRO_ACTOR_PREFIX}${compra.id}`,
      },
    });
  }

  return { code: compra.code, lineas: v.lineas.length, total, destino: input.destino.tipo, saldoDeuda };
}

/**
 * A-4 — Cuánto se DEVOLVIÓ YA de cada producto de una compra (magnitud positiva), leyendo el
 * ledger (movimientos `DEVOLUCION_PROVEEDOR` con ese `purchaseId`). El ledger guarda `qty`
 * FIRMADA (negativa en salidas), así que se suma y se toma el valor absoluto.
 */
export async function alreadyReturnedByProduct(
  tenantId: string,
  purchaseId: string,
  productIds: string[],
): Promise<Map<string, number>> {
  const ids = productIds.filter((id): id is string => !!id);
  if (ids.length === 0) return new Map();
  const grouped = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: {
      tenantId,
      type: "DEVOLUCION_PROVEEDOR",
      purchaseId,
      productId: { in: ids },
    },
    _sum: { qty: true },
  });
  const out = new Map<string, number>();
  for (const g of grouped) {
    if (!g.productId) continue;
    out.set(g.productId, Math.abs(g._sum.qty ?? 0));
  }
  return out;
}

export interface SupplierReturnRow {
  id: string;
  productId: string | null;
  productName: string;
  qty: number; // magnitud devuelta (positiva)
  unitCost: number | null;
  /** Valor de la devolución (qty × unitCost), para el reporte. */
  value: number;
  reason: string | null;
  purchaseId: string | null;
  at: Date;
  by: string;
}

/**
 * Lista las devoluciones a proveedor del tenant (movimientos DEVOLUCION_PROVEEDOR del
 * ledger), de la más reciente a la más vieja. Read-only, para la pantalla de devoluciones.
 */
export async function listSupplierReturns(
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<SupplierReturnRow[]> {
  const rows = await prisma.stockMovement.findMany({
    where: whereDevoluciones(tenantId),
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
  });

  return rows.map((m) => {
    const qty = Math.abs(m.qty); // el ledger la guarda firmada (negativa); la mostramos positiva
    const unitCost = m.unitCost;
    return {
      id: m.id,
      productId: m.productId,
      productName: m.product?.name ?? "(producto eliminado)",
      qty,
      unitCost,
      value: unitCost != null ? round2(qty * unitCost) : 0,
      reason: m.reason,
      purchaseId: m.purchaseId,
      at: m.createdAt,
      by: m.createdBy,
    };
  });
}
