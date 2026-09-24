// ============================================================================
// TEST-GATE · ANULAR UNA VENTA, LA FRONTERA DEL DÍA CERRADO Y EL PESO REAL
// ============================================================================
//
// Los tres defectos de plata que cubren estos tests, con lo que pasaba antes:
//
//  · `cancelOrder` hacía un `update` de estado y NADA más: la venta quedaba "Cancelada" y su
//    plata seguía en el libro y en el arqueo, y su kilaje seguía descontado del stock.
//  · `createOrder` era el único escritor de plata que no miraba la frontera del cierre: se
//    podía cobrar sobre un día ya arqueado y firmado.
//  · No existía forma de ajustar un pedido al peso real, aunque la vidriera lo prometa por
//    escrito.
//
// Sin DB (ADR-026): se ejercita el CUERPO REAL (`anularVentaInTx`, que a su vez llama al
// `recordMovement` real del ledger) contra un doble de transacción que hace respetar lo que
// hace respetar Postgres — el `@@unique(tenantId, orderId, type)` de `CashMovement` y el
// compare-and-set del estado. Si alguien revierte el arreglo, el doble queda con 0 egresos y
// el stock sin devolver, y estos tests se ponen rojos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Prisma } from "@/generated/prisma/client";
import {
  anularVentaInTx,
  AnulacionVentaRechazada,
  planAnulacionVenta,
  planEdicionDeLineas,
  deltasDeStock,
  laVentaEscribeEnCaja,
  fronteraDeVenta,
  mensajeVentaEnDiaCerrado,
  esEgresoDeAnulacionDeVenta,
  ANULACION_VENTA_ACTOR_PREFIX,
  type AnulacionVentaTx,
} from "./order-anulacion";
import { isFrozenDay } from "@/lib/caja/cierre-diario";

// ── Doble de transacción ────────────────────────────────────────────────────
//
// Modela lo mínimo que la DB garantiza de verdad: el índice único de `CashMovement`
// (tenantId, orderId, type), el filtro del compare-and-set de estado y la baja condicional
// de stock del ledger.

type Fila = Record<string, unknown>;

function nuevoMundo(opts: {
  status?: string;
  paid?: boolean;
  conAsiento?: boolean;
  occurredAt?: Date;
  stock?: number;
  trackStock?: boolean;
  /** La fila 'cupon-del-pedido' que escribió el alta (sus `changes`), si la venta usó cupón. */
  cuponDelPedido?: Record<string, unknown>;
}) {
  const mundo = {
    order: {
      id: "ord_1",
      code: 42,
      status: opts.status ?? "DELIVERED",
      createdAt: new Date("2026-09-15T13:00:00Z"),
      items: [
        {
          productId: "prod_vacio",
          name: "Vacío al vacío",
          quantity: 1.24,
          product: { trackStock: opts.trackStock ?? true },
        },
      ],
    },
    cashMovements: [] as Fila[],
    stockMovements: [] as Fila[],
    stock: opts.stock ?? 10,
    ordersUpdated: 0,
    // Dos cupones con el MISMO código en dos negocios: la devolución no puede cruzar de negocio.
    cupones: [
      { id: "cup_1", tenantId: "t1", code: "VERANO10", usedCount: 1, createdAt: new Date("2026-09-01T12:00:00Z") },
      { id: "cup_otro", tenantId: "t2", code: "VERANO10", usedCount: 1, createdAt: new Date("2026-09-01T12:00:00Z") },
    ],
    auditoria: opts.cuponDelPedido
      ? [{ tenantId: "t1", entity: "Order", action: "cupon-del-pedido", entityId: "ord_1", changes: opts.cuponDelPedido }]
      : ([] as { tenantId: string; entity: string; action: string; entityId: string; changes: unknown }[]),
  };
  if (opts.conAsiento !== false) {
    mundo.cashMovements.push({
      id: "cm_venta",
      orderId: "ord_1",
      type: "VENTA",
      method: "EFECTIVO",
      amount: 23436,
      sessionId: "sess_7",
      occurredAt: opts.occurredAt ?? new Date("2026-09-15T13:00:00Z"),
      createdBy: "user:u1",
    });
  }
  return mundo;
}

function txDe(mundo: ReturnType<typeof nuevoMundo>): AnulacionVentaTx {
  const tx = {
    auditLog: {
      findFirst: async (args: { where: { tenantId: string; entity: string; action: string; entityId: string } }) =>
        mundo.auditoria.find(
          (f) =>
            f.tenantId === args.where.tenantId &&
            f.entity === args.where.entity &&
            f.action === args.where.action &&
            f.entityId === args.where.entityId,
        ) ?? null,
    },
    coupon: {
      // Lo que hace Postgres con el `where` de la devolución: negocio, id o código, usedCount > 0
      // y, si viene, creado hasta tal fecha.
      updateMany: async (args: {
        where: { tenantId: string; id?: string; code?: string; usedCount: { gt: number }; createdAt?: { lte: Date } };
        data: { usedCount: { decrement: number } };
      }) => {
        const filas = mundo.cupones.filter(
          (c) =>
            c.tenantId === args.where.tenantId &&
            (args.where.id === undefined || c.id === args.where.id) &&
            (args.where.code === undefined || c.code === args.where.code) &&
            (args.where.createdAt === undefined || c.createdAt.getTime() <= args.where.createdAt.lte.getTime()) &&
            c.usedCount > args.where.usedCount.gt,
        );
        for (const c of filas) c.usedCount -= args.data.usedCount.decrement;
        return { count: filas.length };
      },
    },
    order: {
      findFirst: async () => (mundo.order ? { ...mundo.order } : null),
      // COMPARE-AND-SET: sólo afecta la fila si todavía no está CANCELLED.
      updateMany: async (args: { where: { status?: { not?: string } }; data: { status: string } }) => {
        if (args.where.status?.not === "CANCELLED" && mundo.order.status === "CANCELLED") {
          return { count: 0 };
        }
        mundo.order.status = args.data.status;
        mundo.ordersUpdated += 1;
        return { count: 1 };
      },
    },
    cashMovement: {
      findFirst: async (args: { where: { type?: string } }) =>
        mundo.cashMovements.find((m) => m.type === args.where.type) ?? null,
      create: async (args: { data: Fila }) => {
        // El @@unique(tenantId, orderId, type), APLICADO en la base.
        if (
          mundo.cashMovements.some(
            (m) => m.orderId === args.data.orderId && m.type === args.data.type,
          )
        ) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "7.8.0",
            meta: { target: "CashMovement_tenantId_orderId_type_key" },
          });
        }
        const fila = { id: `cm_${mundo.cashMovements.length + 1}`, ...args.data };
        mundo.cashMovements.push(fila);
        return fila;
      },
    },
    product: {
      updateMany: async (args: { where: { stock?: { gte: number } }; data: { stock: { increment: number } } }) => {
        const min = args.where.stock?.gte;
        if (min !== undefined && mundo.stock < min) return { count: 0 };
        mundo.stock += args.data.stock.increment;
        return { count: 1 };
      },
      findUnique: async () => ({ stock: mundo.stock }),
    },
    stockMovement: {
      create: async (args: { data: Fila }) => {
        mundo.stockMovements.push(args.data);
        return args.data;
      },
    },
  };
  return tx as unknown as AnulacionVentaTx;
}

const ARGS_BASE = {
  orderId: "ord_1",
  motivo: "Se pesó mal: decía 1,240 y eran 1,310",
  actor: "user:u1",
  devuelveStock: true,
  esDiaCerrado: isFrozenDay,
  diaDe: (d: Date) => d.toISOString().slice(0, 10),
};

// ── 1. La anulación mueve la plata Y la mercadería ──────────────────────────

test("anular una venta cobrada asienta el EGRESO y devuelve los kilos", async () => {
  const mundo = nuevoMundo({});
  const r = await anularVentaInTx(txDe(mundo), "t1", { ...ARGS_BASE, diaCerradoHasta: null });

  assert.equal(r.applied, true);
  assert.equal(mundo.order.status, "CANCELLED");

  // La plata: UNA contrapartida, por el mismo importe y el mismo medio.
  const egreso = mundo.cashMovements.find((m) => m.type === "EGRESO");
  assert.ok(egreso, "sin EGRESO, la venta anulada sigue contando plata en el libro y el arqueo");
  assert.equal(egreso!.amount, 23436);
  assert.equal(egreso!.method, "EFECTIVO");
  assert.equal(egreso!.orderId, "ord_1");
  assert.equal(egreso!.sessionId, "sess_7"); // el mismo turno: el arqueo de ese turno cierra
  assert.ok(String(egreso!.reason).includes("#42"));

  // La mercadería: vuelve exactamente lo que había salido.
  assert.equal(mundo.stock, 11.24);
  assert.equal(mundo.stockMovements.length, 1);
  assert.equal(mundo.stockMovements[0].qty, 1.24);
  assert.equal(mundo.stockMovements[0].orderId, "ord_1");
  if (r.applied) {
    assert.equal(r.montoRevertido, 23436);
    assert.deepEqual(r.stockDevuelto, [{ productId: "prod_vacio", name: "Vacío al vacío", qty: 1.24 }]);
  }
});

test("la contrapartida va con la FECHA DEL ASIENTO ORIGINAL, no con la de hoy", async () => {
  const original = new Date("2026-09-15T13:00:00Z");
  const mundo = nuevoMundo({ occurredAt: original });
  await anularVentaInTx(txDe(mundo), "t1", { ...ARGS_BASE, diaCerradoHasta: null });
  const egreso = mundo.cashMovements.find((m) => m.type === "EGRESO")!;
  // Si se asentara con la fecha de hoy, el día del cobro quedaría con un ingreso de más
  // para siempre y hoy con un egreso que nadie pidió: dos días mal en vez de cero.
  assert.equal((egreso.occurredAt as Date).getTime(), original.getTime());
});

test("la contrapartida queda FIRMADA para que el libro no la deje borrar", async () => {
  const mundo = nuevoMundo({});
  await anularVentaInTx(txDe(mundo), "t1", { ...ARGS_BASE, diaCerradoHasta: null });
  const egreso = mundo.cashMovements.find((m) => m.type === "EGRESO")!;
  assert.ok(String(egreso.createdBy).startsWith(ANULACION_VENTA_ACTOR_PREFIX));
  assert.equal(esEgresoDeAnulacionDeVenta(egreso as { createdBy: string }), true);
  assert.equal(esEgresoDeAnulacionDeVenta({ createdBy: "user:u1" }), false);
});

// ── 2. Un día cerrado no se toca ────────────────────────────────────────────

test("si el día del asiento ya está cerrado, NO se escribe absolutamente nada", async () => {
  const mundo = nuevoMundo({ occurredAt: new Date("2026-09-15T13:00:00Z") });
  await assert.rejects(
    () => anularVentaInTx(txDe(mundo), "t1", { ...ARGS_BASE, diaCerradoHasta: "2026-09-16" }),
    (e: unknown) => e instanceof AnulacionVentaRechazada && e.motivo === "dia-cerrado",
  );
  // Lo que importa no es el error: es que no quedó media anulación.
  assert.equal(mundo.order.status, "DELIVERED");
  assert.equal(mundo.cashMovements.filter((m) => m.type === "EGRESO").length, 0);
  assert.equal(mundo.stock, 10);
  assert.equal(mundo.stockMovements.length, 0);
});

test("el mensaje del día cerrado dice qué hacer, no sólo que no se puede", () => {
  const msg = mensajeVentaEnDiaCerrado("2026-09-17", "2026-09-16");
  assert.ok(msg.includes("17/09/2026"));
  assert.ok(msg.includes("16/09/2026")); // hasta cuándo está cerrado
  assert.ok(msg.includes("17/09/2026")); // el primer día abierto
  assert.ok(msg.toLowerCase().includes("cobrado")); // la salida concreta, en esta pantalla
});

test("un pedido SIN cobrar se anula aunque el día esté cerrado: no hay plata que mover", async () => {
  const mundo = nuevoMundo({ conAsiento: false, status: "PENDING" });
  const r = await anularVentaInTx(txDe(mundo), "t1", { ...ARGS_BASE, diaCerradoHasta: "2026-09-30" });
  assert.equal(r.applied, true);
  assert.equal(mundo.cashMovements.length, 0);
  assert.equal(mundo.stock, 11.24); // el stock sí vuelve
});

// ── 3. Doble clic ───────────────────────────────────────────────────────────

test("dos clics en Anular devuelven el stock UNA sola vez", async () => {
  const mundo = nuevoMundo({});
  const tx = txDe(mundo);
  const a = await anularVentaInTx(tx, "t1", { ...ARGS_BASE, diaCerradoHasta: null });
  const b = await anularVentaInTx(tx, "t1", { ...ARGS_BASE, diaCerradoHasta: null });
  assert.equal(a.applied, true);
  assert.deepEqual(b, { applied: false, reason: "duplicate" });
  assert.equal(mundo.cashMovements.filter((m) => m.type === "EGRESO").length, 1);
  assert.equal(mundo.stockMovements.length, 1);
  assert.equal(mundo.stock, 11.24);
});

// ── 4. Reglas puras ─────────────────────────────────────────────────────────

test("una venta ENTREGADA se puede anular: es la corrección diaria de una carnicería", () => {
  assert.deepEqual(
    planAnulacionVenta({ existe: true, yaAnulada: false, diaCerrado: false }),
    { ok: true },
  );
});

test("el doble clic contesta 'ya está', no 'no se puede' — aunque el día esté cerrado", () => {
  assert.deepEqual(planAnulacionVenta({ existe: true, yaAnulada: true, diaCerrado: true }), {
    ok: false,
    motivo: "ya-anulada",
  });
});

test("la frontera del día cerrado sólo frena la venta que ESCRIBE en la caja", () => {
  assert.equal(laVentaEscribeEnCaja({ paid: true, paymentMethod: "EFECTIVO" }), true);
  assert.equal(laVentaEscribeEnCaja({ paid: true, paymentMethod: "MERCADOPAGO" }), true);
  assert.equal(laVentaEscribeEnCaja({ paid: true, paymentMethod: "TRANSFERENCIA" }), true);
  // Tomar un pedido sin cobrar no toca el libro: no se bloquea (si no, el mostrador no
  // podría anotar el pedido de mañana después de cerrar la caja).
  assert.equal(laVentaEscribeEnCaja({ paid: false, paymentMethod: "EFECTIVO" }), false);
  assert.equal(laVentaEscribeEnCaja({ paid: true, paymentMethod: null }), false);
  assert.equal(laVentaEscribeEnCaja({ paid: true, paymentMethod: "CRIPTO" }), false);
});

test("la venta COBRADA de un día ya cerrado se rechaza — el arqueo firmado no se toca", () => {
  const r = fronteraDeVenta({
    paid: true,
    paymentMethod: "EFECTIVO",
    hoy: "2026-09-17",
    cerradoHasta: "2026-09-17",
    esDiaCerrado: isFrozenDay,
  });
  assert.equal(r.bloquea, true);
  // Sin esto, el arqueo del día decía 6 movimientos y el libro del MISMO día decía 8.
  if (r.bloquea) assert.ok(r.error.includes("17/09/2026"));
});

test("el pedido SIN cobrar entra igual con el día cerrado: no escribe en la caja", () => {
  assert.deepEqual(
    fronteraDeVenta({
      paid: false,
      paymentMethod: null,
      hoy: "2026-09-17",
      cerradoHasta: "2026-09-17",
      esDiaCerrado: isFrozenDay,
    }),
    { bloquea: false },
  );
});

test("sin ningún cierre hecho, el mostrador opera exactamente como antes", () => {
  assert.deepEqual(
    fronteraDeVenta({
      paid: true,
      paymentMethod: "EFECTIVO",
      hoy: "2026-09-17",
      cerradoHasta: null,
      esDiaCerrado: isFrozenDay,
    }),
    { bloquea: false },
  );
});

test("cobrar un pedido ya tomado tiene la MISMA frontera que el alta", () => {
  // El hallazgo que venía en el encargo decía que `createOrder` era el único escritor de
  // plata sin frontera. `cobrarPedido` —en el mismo archivo— también escribe en el libro
  // (`recordCashSaleMovementInTx`) y tampoco la miraba: sin esto, la salida que el POS le
  // ofrece a la persona ("dejalo sin cobrar y cobralo mañana") se podía usar el MISMO día.
  const r = fronteraDeVenta({
    paid: true,
    paymentMethod: "EFECTIVO",
    hoy: "2026-09-17",
    cerradoHasta: "2026-09-17",
    esDiaCerrado: isFrozenDay,
    contexto: "cobro",
  });
  assert.equal(r.bloquea, true);
  if (r.bloquea) {
    assert.ok(r.error.includes("18/09/2026")); // el primer día abierto
    assert.ok(!r.error.includes("Destildá")); // esa salida es la del POS, no la de la bandeja
  }
});

test("con el día de hoy todavía ABIERTO, la venta cobrada pasa", () => {
  assert.deepEqual(
    fronteraDeVenta({
      paid: true,
      paymentMethod: "EFECTIVO",
      hoy: "2026-09-17",
      cerradoHasta: "2026-09-16",
      esDiaCerrado: isFrozenDay,
    }),
    { bloquea: false },
  );
});

// ── 5. Editar al peso real ──────────────────────────────────────────────────

test("un pedido sin cobrar se edita; uno cobrado NO", () => {
  const base = { existe: true, status: "PENDING", tieneAsientoDeCaja: false, lineasValidas: 1 };
  assert.deepEqual(planEdicionDeLineas({ ...base, paid: false }), { ok: true });
  assert.deepEqual(planEdicionDeLineas({ ...base, paid: true }), { ok: false, motivo: "ya-cobrada" });
});

test("si hay asiento en el libro no se edita, aunque el pedido diga que no está cobrado", () => {
  // La invariante se chequea contra el LIBRO: `paid` puede mentir (imputación vieja, arreglo
  // a mano). Editar movería el total sin tocar la plata ya asentada.
  assert.deepEqual(
    planEdicionDeLineas({
      existe: true,
      paid: false,
      status: "PENDING",
      tieneAsientoDeCaja: true,
      lineasValidas: 1,
    }),
    { ok: false, motivo: "tiene-caja" },
  );
});

test("un pedido entregado o anulado no se edita", () => {
  const base = { existe: true, paid: false, tieneAsientoDeCaja: false, lineasValidas: 1 };
  assert.deepEqual(planEdicionDeLineas({ ...base, status: "DELIVERED" }), { ok: false, motivo: "terminal" });
  assert.deepEqual(planEdicionDeLineas({ ...base, status: "CANCELLED" }), { ok: false, motivo: "terminal" });
});

test("el peso real mueve SÓLO la diferencia: de 1,240 a 1,310 salen 70 gramos", () => {
  const d = deltasDeStock(
    [{ productId: "p1", quantity: 1.24, trackStock: true }],
    [{ productId: "p1", quantity: 1.31, trackStock: true }],
  );
  assert.deepEqual(d, [{ productId: "p1", delta: 0.07 }]);
});

test("si el paquete pesó menos, la diferencia vuelve al stock", () => {
  const d = deltasDeStock(
    [{ productId: "p1", quantity: 2, trackStock: true }],
    [{ productId: "p1", quantity: 1.8, trackStock: true }],
  );
  assert.deepEqual(d, [{ productId: "p1", delta: -0.2 }]);
});

test("producto sacado del pedido: vuelve todo; producto agregado: sale todo", () => {
  const d = deltasDeStock(
    [{ productId: "p1", quantity: 1, trackStock: true }],
    [{ productId: "p2", quantity: 3, trackStock: true }],
  );
  assert.deepEqual(d.sort((a, b) => a.productId.localeCompare(b.productId)), [
    { productId: "p1", delta: -1 },
    { productId: "p2", delta: 3 },
  ]);
});

test("mismo peso = ningún movimiento de stock (no se ensucia el ledger al guardar sin cambios)", () => {
  assert.deepEqual(
    deltasDeStock(
      [{ productId: "p1", quantity: 1.24, trackStock: true }],
      [{ productId: "p1", quantity: 1.24, trackStock: true }],
    ),
    [],
  );
});

test("los productos sin control de stock no entran al delta", () => {
  assert.deepEqual(
    deltasDeStock(
      [{ productId: "p1", quantity: 1, trackStock: false }],
      [{ productId: "p1", quantity: 5, trackStock: false }],
    ),
    [],
  );
});

// ── Lo que NO puede degradar a la clienta que ya opera ──────────────────────
//
// beauty-spa es el único tenant vivo en producción, y vende turnos, no kilos. Dos cambios de
// esta tanda la tocaban de rebote y hubo que gatearlos.

test("sólo el rubro MOSTRADOR nace DELIVERED: la estética conserva su bandeja", () => {
  // En la bandeja, un pedido DELIVERED cae en la lista de cerrados y deja de ofrecer sus
  // acciones. Para una estética —un puñado de ventas de mostrador por día, bandeja sin
  // tapar— eso es sólo perder la forma de corregir una venta, sin ganar nada. El problema
  // que el cambio resuelve es de VOLUMEN, y el volumen es del rubro de mostrador.
  const src = readFileSync(new URL("./order-actions.ts", import.meta.url), "utf8");
  const i = src.indexOf("const naceEntregada");
  assert.ok(i > 0, "order-actions.ts ya no decide el nacimiento DELIVERED");
  const linea = src.slice(i, src.indexOf(";", i));
  assert.match(
    linea,
    /isRetail/,
    "el nacimiento DELIVERED dejó de estar gateado por rubro: vuelve a degradar a beauty-spa",
  );
});

// ── El cupón de una venta anulada vuelve a quedar disponible ────────────────
//
// Antes: un cupón de UN uso gastado en una venta que después se anulaba quedaba agotado para
// siempre, aunque la venta ya no existiera. Ahora la anulación devuelve el uso en su misma
// transacción, y anular dos veces no devuelve dos.

test("anular una venta con cupón devuelve el uso a ESE cupón, y anular otra vez no devuelve otro", async () => {
  const mundo = nuevoMundo({ cuponDelPedido: { codigo: "VERANO10", tipo: "PERCENT", valor: 10, monto: 2343.6, cuponId: "cup_1" } });
  const tx = txDe(mundo);
  const r = await anularVentaInTx(tx, "t1", { ...ARGS_BASE, diaCerradoHasta: null });
  assert.equal(r.applied, true);
  if (r.applied) assert.equal(r.cuponDevuelto, "VERANO10");
  assert.equal(mundo.cupones.find((c) => c.id === "cup_1")!.usedCount, 0, "el uso vuelve");
  assert.equal(mundo.cupones.find((c) => c.id === "cup_otro")!.usedCount, 1, "el del otro negocio no se toca");

  // El doble clic: el compare-and-set del estado frena la segunda y el cupón no baja otra vez.
  const otra = await anularVentaInTx(tx, "t1", { ...ARGS_BASE, diaCerradoHasta: null });
  assert.deepEqual(otra, { applied: false, reason: "duplicate" });
  assert.equal(mundo.cupones.find((c) => c.id === "cup_1")!.usedCount, 0);
});

test("una fila de cupón vieja (sin id) devuelve por código, dentro del negocio y sin bajar de cero", async () => {
  const mundo = nuevoMundo({ cuponDelPedido: { codigo: "VERANO10", tipo: "PERCENT", valor: 10, monto: 2343.6 } });
  mundo.cupones[0].usedCount = 0; // la dueña lo reinició a mano
  const r = await anularVentaInTx(txDe(mundo), "t1", { ...ARGS_BASE, diaCerradoHasta: null });
  assert.equal(r.applied, true);
  if (r.applied) assert.equal(r.cuponDevuelto, null, "no había uso que devolver");
  assert.deepEqual(
    mundo.cupones.map((c) => c.usedCount),
    [0, 1],
    "ni negativo en el propio, ni tocar el del otro negocio con el mismo código",
  );
});

test("fila vieja (sin id) y el cupón se borró y se recreó DESPUÉS del pedido con el mismo código: no se le devuelve un uso al nuevo", async () => {
  const mundo = nuevoMundo({ cuponDelPedido: { codigo: "VERANO10", tipo: "PERCENT", valor: 10, monto: 2343.6 } });
  // El pedido es del 15/09; la dueña borró VERANO10 y lo volvió a crear el 20/09, y el nuevo ya tiene un uso.
  mundo.cupones[0] = { id: "cup_nuevo", tenantId: "t1", code: "VERANO10", usedCount: 1, createdAt: new Date("2026-09-20T12:00:00Z") };
  const r = await anularVentaInTx(txDe(mundo), "t1", { ...ARGS_BASE, diaCerradoHasta: null });
  assert.equal(r.applied, true, "la anulación sigue igual");
  if (r.applied) assert.equal(r.cuponDevuelto, null);
  assert.equal(mundo.cupones[0].usedCount, 1, "el uso del cupón nuevo no se toca: no se gastó en este pedido");

  // El mismo caso con el cupón creado ANTES del pedido (el que se usó): el uso sí vuelve.
  const antes = nuevoMundo({ cuponDelPedido: { codigo: "VERANO10", tipo: "PERCENT", valor: 10, monto: 2343.6 } });
  const r2 = await anularVentaInTx(txDe(antes), "t1", { ...ARGS_BASE, diaCerradoHasta: null });
  if (r2.applied) assert.equal(r2.cuponDevuelto, "VERANO10");
  assert.equal(antes.cupones[0].usedCount, 0);
});

test("una venta sin cupón se anula igual y no toca ningún cupón", async () => {
  const mundo = nuevoMundo({});
  const r = await anularVentaInTx(txDe(mundo), "t1", { ...ARGS_BASE, diaCerradoHasta: null });
  assert.equal(r.applied, true);
  if (r.applied) assert.equal(r.cuponDevuelto, null);
  assert.deepEqual(mundo.cupones.map((c) => c.usedCount), [1, 1]);
});

test("si la anulación no pasa (día cerrado), el cupón tampoco vuelve", async () => {
  const mundo = nuevoMundo({
    occurredAt: new Date("2026-09-15T13:00:00Z"),
    cuponDelPedido: { codigo: "VERANO10", tipo: "PERCENT", valor: 10, monto: 1, cuponId: "cup_1" },
  });
  await assert.rejects(() => anularVentaInTx(txDe(mundo), "t1", { ...ARGS_BASE, diaCerradoHasta: "2026-09-16" }));
  assert.equal(mundo.cupones[0].usedCount, 1);
});
