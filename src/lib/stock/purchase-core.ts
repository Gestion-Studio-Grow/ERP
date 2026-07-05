// Núcleo de COMPRAS / REPOSICIÓN de stock — contracara de order-core.ts.
//
// La venta descuenta stock con guarda anti-oversell; la compra/reposición lo
// REPONE. Igual que en la caja (src/lib/caja), la aritmética pura (armar líneas,
// snapshot de costo, total) vive separada y unit-testeable (purchase-core.test.ts);
// `insertStockPurchase` orquesta la persistencia y reusa esos helpers, sin duplicar
// el cálculo.
//
// No audita, no revalida, no autoriza: de eso se ocupa la Server Action
// (stock-actions.ts). Aislamiento multi-tenant: recibe el `tenantId` ya resuelto
// (fail-closed ADR-015) y lo escribe en cada fila; el read de productos filtra por él.

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";

export type StockPurchaseKind = "COMPRA" | "REPOSICION";

export type PurchaseInput = {
  kind: StockPurchaseKind;
  supplier: string | null;
  notes: string | null;
  createdBy: string; // actor "user:<id>", lo resuelve la Server Action
  items: { productId: string; qty: number; unitCost: number }[];
};

export type InsertedPurchase = {
  id: string;
  code: number;
  totalCost: number;
  lines: number;
};

// Producto tal como lo ve la aritmética: lo mínimo para snapshotear la línea.
export type PurchaseProduct = { id: string; name: string; unit: string };

// Una línea ya validada y snapshoteada, lista para persistir.
export type PurchaseLine = {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
};

// Redondeo a 2 decimales (pesos). El costo de compra puede venir con fracción
// (0.750 kg × $1234/kg); se snapshotea el total ya redondeado.
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ¿Es una cantidad utilizable? Debe ser finita y > 0 (no se repone 0 ni negativo:
// un ajuste hacia abajo es otra operación, fuera de alcance). Blindaje del cálculo
// además de la validación de entrada de la acción.
function usableQty(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

// Costo unitario normalizado: negativo/no-finito → 0 (una reposición sin costo, o
// un dato basura, no descuenta dinero ni ensucia el total).
function safeCost(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Arma las líneas de la entrada: para cada ítem pedido busca el producto real del
// tenant (snapshot de nombre/unidad, ADR-009 §4), descarta cantidades no válidas y
// productos desconocidos, y calcula el total de línea (cantidad × costo unitario).
export function buildPurchaseLines(
  products: readonly PurchaseProduct[],
  items: readonly { productId: string; qty: number; unitCost: number }[],
): PurchaseLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return items
    .map((it) => {
      const p = byId.get(it.productId);
      if (!p || !usableQty(it.qty)) return null;
      const unitCost = safeCost(it.unitCost);
      return {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        quantity: it.qty,
        unitCost,
        lineTotal: round2(it.qty * unitCost),
      };
    })
    .filter((l): l is PurchaseLine => l !== null);
}

// Costo total del documento = Σ líneas, redondeado (no arrastra el error de coma
// flotante de sumar varios importes).
export function purchaseTotal(lines: readonly PurchaseLine[]): number {
  return round2(lines.reduce((s, l) => s + l.lineTotal, 0));
}

// Valida, snapshotea costos y crea la entrada + sus líneas, INCREMENTANDO el stock
// de cada producto, todo en una transacción tenant-aware. El incremento aplica a
// TODOS los productos de la entrada (independiente de `trackStock`: el flag solo
// gobierna la guarda de venta; reponer siempre suma existencias reales). Sumar no
// puede fallar por falta de stock, así que no hay guarda condicional como en la
// venta: o se registra todo, o no pasa nada.
export async function insertStockPurchase(
  tenantId: string,
  input: PurchaseInput,
): Promise<InsertedPurchase> {
  const wanted = input.items.filter(
    (l) => l.productId && Number.isFinite(l.qty) && l.qty > 0,
  );
  if (wanted.length === 0) {
    throw new Error("Agregá al menos un producto con cantidad para registrar la entrada.");
  }

  const products = await prisma.product.findMany({
    where: { id: { in: wanted.map((l) => l.productId) }, tenantId, deletedAt: null },
    select: { id: true, name: true, unit: true },
  });

  const lines = buildPurchaseLines(products, wanted);
  if (lines.length === 0) {
    throw new Error("Ninguno de los productos elegidos es válido para reponer stock.");
  }
  const totalCost = purchaseTotal(lines);

  const purchase = await tenantTransaction(async (tx) => {
    // Correlativo legible por tenant: max(code)+1 (mismo criterio que Order). El
    // @@unique([tenantId, code]) protege contra choques: una colisión rarísima
    // lanzaría y se reintenta el alta.
    const last = await tx.stockPurchase.findFirst({
      where: { tenantId },
      orderBy: { code: "desc" },
      select: { code: true },
    });
    const code = (last?.code ?? 0) + 1;

    const created = await tx.stockPurchase.create({
      data: {
        tenantId,
        code,
        kind: input.kind,
        supplier: input.supplier,
        notes: input.notes,
        totalCost,
        createdBy: input.createdBy,
        items: {
          create: lines.map((l) => ({
            tenantId,
            productId: l.productId,
            name: l.name,
            unit: l.unit,
            quantity: l.quantity,
            unitCost: l.unitCost,
            lineTotal: l.lineTotal,
          })),
        },
      },
      select: { id: true, code: true },
    });

    // Reposición de stock: incremento atómico por producto. No hace falta guarda
    // (a diferencia de la venta): sumar existencias siempre es válido.
    for (const l of lines) {
      await tx.product.updateMany({
        where: { id: l.productId, tenantId },
        data: { stock: { increment: l.quantity } },
      });
    }

    return created;
  }, { tenantId });

  return { id: purchase.id, code: purchase.code, totalCost, lines: lines.length };
}
