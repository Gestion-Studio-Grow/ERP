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
import { recordMovement } from "@/lib/stock/ledger";
import { round2 } from "@/lib/round";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import type { DayKey } from "@/lib/caja/cierre-diario";
import type { CashMethod } from "@/lib/caja/cash-register";
import {
  decidirEgresoDeCompra,
  PAGO_POR_DEFECTO,
  type MotivoSinEgreso,
  type PagoDeCompra,
} from "@/lib/stock/purchase-egreso";

export type StockPurchaseKind = "COMPRA" | "REPOSICION";

export type PurchaseInput = {
  kind: StockPurchaseKind;
  // Proveedor del maestro (`Supplier`). Si viene, se valida que sea del negocio y esté activo,
  // y su razón social se copia en `supplier` (el texto queda como foto de ese momento).
  supplierId?: string | null;
  // Proveedor escrito a mano, para el negocio que todavía no cargó su maestro de proveedores.
  supplier: string | null;
  notes: string | null;
  createdBy: string; // actor "user:<id>", lo resuelve la Server Action
  items: { productId: string; qty: number; unitCost: number }[];
  // Cómo se pagó la compra. OPCIONAL a la fuerza, no por comodidad: el formulario de
  // /admin/compras todavía no lo pregunta y `stock-actions.ts` no puede mandarlo. Si
  // falta, se aplica `PAGO_POR_DEFECTO` (pagada, medio asumido y MARCADO en el detalle
  // del asiento). Cuando el formulario capture el medio, este campo pasa a ser
  // obligatorio y el default se borra.
  pago?: PagoDeCompra;
};

// Resultado del asiento de caja de la compra. Va en el resultado —y no se descarta—
// porque la Server Action lo audita: "compra #12 registrada, egreso no asentado porque
// es a cuenta corriente" es un hecho que hay que poder reconstruir después.
export type PurchaseEgresoResult =
  | {
      asentado: true;
      movementId: string;
      amount: number;
      method: CashMethod;
      dia: DayKey;
      medioAsumido: boolean;
      diferidoPorCierre: boolean;
    }
  | { asentado: false; motivo: MotivoSinEgreso | "ya-asentado" };

export type InsertedPurchase = {
  id: string;
  code: number;
  totalCost: number;
  lines: number;
  egreso: PurchaseEgresoResult;
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

// Redondeo a 2 decimales (pesos): regla única en src/lib/round.ts (importada arriba).
// El costo de compra puede venir con fracción (0.750 kg × $1234/kg); se snapshotea redondeado.

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

// ── Qué se lee ──────────────────────────────────────────────────────────────

/**
 * Las COMPRAS del negocio (no las reposiciones), desde `desde` si se da. El mismo `where` para
 * las compras que se pueden devolver (suppliers/devoluciones.ts) y para el número de Recibir
 * mercadería del Inicio (compras del mes). PURA.
 */
export function whereCompras(tenantId: string, desde?: Date) {
  return { tenantId, kind: "COMPRA" as const, ...(desde ? { createdAt: { gte: desde } } : {}) };
}

// ── Una recepción según quién la carga ──────────────────────────────────────
//
// El encargado (RECEPTION) recibe mercadería pero no ve costos (`costs:read`): su recepción entra
// SIN costo y SIN medio de pago, y no mueve la caja. El formulario ya no le muestra esos campos,
// pero el servidor no puede confiar en eso (un formulario viejo abierto, una llamada armada a
// mano): lo que llegue de costo o de pago se IGNORA. La regla vivía suelta dentro del
// "use server" de stock-actions.ts, sin un test que la ejecutara; acá es pura y la acción la usa.

/**
 * El medio de pago que vale para esta recepción: el elegido, sólo si es una COMPRA y quien la
 * carga ve costos. Una REPOSICIÓN interna no mueve plata. PURA.
 */
export function medioDeLaRecepcion(kind: StockPurchaseKind, conCostos: boolean, elegido: CashMethod | null): CashMethod | null {
  return kind === "COMPRA" && conCostos ? elegido : null;
}

/**
 * El costo unitario de una línea: sin `conCostos` es 0 y el costo que llegó NI SE LEE (`leer` no
 * se llama: un costo ilegible no le rompe la recepción al encargado). Con costos, vacío es 0 (la
 * reposición sin costo) y lo ilegible lanza desde `leer`. PURA.
 */
export function costoDeLaLinea(conCostos: boolean, leer: () => number | null): number {
  return conCostos ? (leer() ?? 0) : 0;
}

// ── Compra repetida ─────────────────────────────────────────────────────────
//
// El QA midió que, después de registrar una compra, el formulario quedaba cargado y un segundo
// toque la registraba dos veces: el stock subía el doble y el egreso salía dos veces de la caja.
// El formulario ahora se vacía al terminar, pero el servidor no puede depender de eso (un
// reintento de red, dos pestañas): la MISMA persona registrando la MISMA compra (mismo tipo,
// proveedor, productos, cantidades y costos) dentro de `VENTANA_REPETIDA_MS` se rechaza con un
// mensaje que dice cuál fue. Dos entregas idénticas de verdad en dos minutos son rarísimas, y
// el mensaje dice cómo cargarla igual.

export const VENTANA_REPETIDA_MS = 2 * 60 * 1000;

/** La huella de una compra: lo que la hace "la misma". PURA. */
export function huellaDeCompra(c: {
  kind: string;
  supplierId: string | null;
  supplier: string | null;
  lineas: readonly { productId: string | null; quantity: number; unitCost: number }[];
}): string {
  const lineas = c.lineas
    .map((l) => `${l.productId ?? ""}:${Math.round(l.quantity * 1000) / 1000}:${round2(l.unitCost)}`)
    .sort()
    .join("|");
  const prov = c.supplierId ? `id:${c.supplierId}` : `txt:${(c.supplier ?? "").trim().toLowerCase()}`;
  return `${c.kind}#${prov}#${lineas}`;
}

/** La compra reciente que es igual a la nueva, o `null`. PURA. */
export function compraRepetida<T extends { code: number; createdAt: Date; huella: string }>(
  huella: string,
  recientes: readonly T[],
  ahora: Date,
): T | null {
  return (
    recientes.find((r) => r.huella === huella && ahora.getTime() - r.createdAt.getTime() <= VENTANA_REPETIDA_MS) ?? null
  );
}

// Valida, snapshotea costos y crea la entrada + sus líneas, INCREMENTANDO el stock
// de cada producto Y ASENTANDO EL EGRESO EN EL LIBRO DE CAJA, todo en una transacción
// tenant-aware. El incremento aplica a TODOS los productos de la entrada (independiente
// de `trackStock`: el flag solo gobierna la guarda de venta; reponer siempre suma
// existencias reales). Sumar no puede fallar por falta de stock, así que no hay guarda
// condicional como en la venta: o se registra todo, o no pasa nada.
//
// EL EGRESO VA EN LA MISMA TRANSACCIÓN (I7, mismo criterio que la venta al contado en
// order-core.ts). Antes no existía: la mercadería entraba y la plata que había salido no
// quedaba escrita en ningún lado, así que el cierre del día daba un faltante igual a lo
// que se le pagó al proveedor (o la dueña lo tipeaba a mano en otra pantalla, con el
// importe re-tipeado). Una compra con stock adentro y sin egreso es PEOR que las dos
// cosas por separado: descuadra la caja sin dejar rastro de por qué. Por eso es
// todo-o-nada, no un "mejor esfuerzo" en una segunda transacción.
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

  // Hasta qué día está congelada la caja. Se lee FUERA de la tx (igual que en
  // libro-caja-actions.ts): es una consulta de sólo lectura sobre estado que no cambia
  // dentro de esta operación, y no vale la pena alargar la transacción de escritura.
  const cerradoHasta = await lastClosedDay(tenantId);
  const hoy = todayInBusinessTz();
  const pago = input.pago ?? PAGO_POR_DEFECTO;

  const purchase = await tenantTransaction(async (tx) => {
    // Una compra a la vez por negocio: el correlativo es max(code)+1 y la verificación de
    // compra repetida lee las recientes; sin este candado, dos envíos simultáneos leían lo
    // mismo y los dos pasaban (o chocaban contra el @@unique del código con un error crudo).
    // `pg_advisory_xact_lock` se suelta solo al terminar la transacción.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`compra:${tenantId}`}))`;

    // Proveedor del maestro: del negocio y activo, o no se registra nada.
    let supplierId: string | null = null;
    let supplier = input.supplier;
    if (input.supplierId) {
      const prov = await tx.supplier.findFirst({
        where: { id: input.supplierId, tenantId, active: true },
        select: { id: true, name: true },
      });
      if (!prov) {
        throw new Error("El proveedor elegido no existe o está dado de baja. Elegí otro de la lista.");
      }
      supplierId = prov.id;
      supplier = prov.name;
    }

    const huella = huellaDeCompra({ kind: input.kind, supplierId, supplier, lineas: lines });
    const recientes = await tx.stockPurchase.findMany({
      where: {
        tenantId,
        createdBy: input.createdBy,
        createdAt: { gte: new Date(Date.now() - VENTANA_REPETIDA_MS) },
      },
      select: {
        code: true,
        kind: true,
        supplierId: true,
        supplier: true,
        createdAt: true,
        items: { select: { productId: true, quantity: true, unitCost: true } },
      },
    });
    const repetida = compraRepetida(
      huella,
      recientes.map((r) => ({ ...r, huella: huellaDeCompra({ ...r, lineas: r.items }) })),
      new Date(),
    );
    if (repetida) {
      throw new Error(
        `Esta misma compra ya se registró recién (#${repetida.code}), así que no se cargó de nuevo. ` +
          "Si de verdad llegó dos veces igual, esperá dos minutos y cargala otra vez.",
      );
    }

    // Correlativo legible por tenant: max(code)+1 (mismo criterio que Order), ya sin
    // carrera por el candado de arriba.
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
        supplier,
        supplierId,
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

    // Reposición de stock vía ledger (`recordMovement`): incremento atómico por
    // producto + fila del StockMovement (COMPRA o REPOSICION, según el documento) en
    // la misma transacción. No hace falta guarda (a diferencia de la venta): sumar
    // existencias siempre es válido. Snapshotea el costo unitario en el movimiento.
    for (const l of lines) {
      await recordMovement(tx, {
        tenantId,
        productId: l.productId,
        type: input.kind,
        qty: l.quantity,
        unitCost: l.unitCost,
        purchaseId: created.id,
        createdBy: input.createdBy,
        label: l.name,
      });
    }

    // ── La plata que salió ──────────────────────────────────────────────────
    //
    // La DECISIÓN (¿corresponde?, ¿por qué medio?, ¿con qué fecha contable?) es pura y
    // está testeada en purchase-egreso.ts. Acá sólo se persiste lo que decidió.
    const decision = decidirEgresoDeCompra({
      kind: input.kind,
      purchaseId: created.id,
      code: created.code,
      supplier,
      totalCost,
      pago,
      hoy,
      cerradoHasta,
    });

    // Arranca en el resultado "no se asentó": si corresponde asentar, el valor sólo
    // sobrevive cuando el pre-chequeo de idempotencia encuentra el asiento ya hecho.
    let egreso: PurchaseEgresoResult = decision.asienta
      ? { asentado: false, motivo: "ya-asentado" }
      : { asentado: false, motivo: decision.motivo };

    if (decision.asienta) {
      const e = decision.egreso;

      // Idempotencia por la marca `compra:<purchaseId>` en `createdBy` (ver
      // purchase-egreso.ts sobre por qué la marca va ahí y no en una columna). Hoy
      // `created.id` es un cuid recién nacido dentro de esta misma tx, así que el
      // pre-chequeo no puede encontrar nada; existe igual porque es la única guarda que
      // habría el día que alguien agregue un camino de "re-asentar" o un reintento sobre
      // una compra ya registrada, y porque un egreso duplicado es plata inventada. El
      // árbitro a nivel DB —un @@unique como el de A-5— necesitaría la columna
      // `purchaseId` en CashMovement, que es una migración más (ver el informe).
      const yaAsentado = await tx.cashMovement.findFirst({
        where: { tenantId, type: "EGRESO", createdBy: e.createdBy },
        select: { id: true },
      });

      if (!yaAsentado) {
        // Si hay un turno de mostrador ABIERTO, el asiento se engancha a ese turno:
        // pagarle al proveedor con la plata del cajón tiene que bajar el efectivo que el
        // arqueo espera. El arqueo filtra por medio, así que un pago por MP enganchado al
        // turno no le toca el efectivo. Mismo criterio que `recordCashSaleMovementInTx`.
        const session = await tx.cashSession.findFirst({
          where: { tenantId, status: "OPEN" },
          select: { id: true },
        });

        const mov = await tx.cashMovement.create({
          data: {
            tenantId,
            sessionId: session?.id ?? null,
            type: e.type,
            method: e.method,
            amount: e.amount,
            reason: e.reason,
            // Se ancla al MEDIODÍA de la zona del negocio, igual que el alta manual del
            // libro: así ningún corrimiento de zona horaria mueve la fila de día.
            occurredAt: businessWallTimeToUtc(e.dia, "12:00"),
            createdBy: e.createdBy,
          },
          select: { id: true },
        });

        egreso = {
          asentado: true,
          movementId: mov.id,
          amount: e.amount,
          method: e.method,
          dia: e.dia,
          medioAsumido: e.medioAsumido,
          diferidoPorCierre: e.diferidoPorCierre,
        };
      }
    }

    return { ...created, egreso };
  }, { tenantId });

  return {
    id: purchase.id,
    code: purchase.code,
    totalCost,
    lines: lines.length,
    egreso: purchase.egreso,
  };
}
