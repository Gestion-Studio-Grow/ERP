// ============================================================================
// VENDER, OLA 3 — cupón, «A cuenta» y el tope del precio a mano, EJECUTADOS.
// ============================================================================
//
// Las piezas REALES del alta (order-core.ts) contra una base falsa que anota lo que se lee y
// se escribe (ADR-026, sin base):
//   · Cupón al máximo de usos → rechazo, y no se crea el pedido. El consumo es un
//     compare-and-set: si otra venta gastó el último uso entre la lectura y la escritura, la
//     segunda lectura rechaza.
//   · «A cuenta» → el pedido queda saldado SIN medio y el libro no asienta nada; al anular la
//     venta, su deuda se anula en la misma transacción (y no, si ya tiene cobros).
//   · Precio a mano de recepción → no baja más del 10 % del precio de lista, no se usa para lo
//     que se vende por kilo con precio, y sin producto llega hasta $50.000. La dueña, sin tope.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import {
  aplicarCuponEnTx,
  anularCuentaDeLaVentaEnTx,
  anularVentaConSuCuentaEnTx,
  controlarPreciosAManoEnTx,
  crearOrdenEnTx,
  decidirAlta,
  registrarCuponDelPedidoEnTx,
  imputarVentaEnTx,
  AnulacionDeCuentaRechazada,
  CuponRechazado,
  PrecioAManoRechazado,
  type OrderInput,
} from "@/lib/order-core";
import {
  aplicarCupon,
  controlarPrecioAMano,
  montoDeCupon,
  topeDePrecioAMano,
  whereConsumoDeCupon,
  CUPON_Y_DESCUENTO,
  MAXIMO_A_MANO_RECEPCION,
  ACCION_CUPON_DEL_PEDIDO,
  leerCuponDelPedido,
  type CuponLeido,
} from "@/lib/venta-reglas";
import { reglasDeAnulacion } from "@/lib/order-anulacion";
import { alcanceDeAnulacion } from "@/lib/capabilities";
import { isFrozenDay } from "@/lib/caja/cierre-diario";
import { renglonesDelTicket, ventaDeOrden } from "./reglas-venta";

const AHORA = new Date("2026-09-23T15:00:00.000Z");
const VACIO = { id: "p_vacio", name: "Vacío", saleUnit: "WEIGHT" as const, price: null, pricePerKg: 12500, trackStock: true };

const VENTA: OrderInput = {
  channel: "COUNTER",
  fulfillment: "PICKUP",
  customerName: "Mostrador",
  customerPhone: "",
  address: null,
  notes: null,
  scheduledFor: null,
  paid: true,
  paymentMethod: "EFECTIVO",
  items: [{ productId: "p_vacio", qty: 1.24 }],
};

function cupon(over: Partial<CuponLeido> = {}): CuponLeido & { id: string } {
  return {
    id: "cup_1",
    code: "VERANO10",
    type: "PERCENT",
    value: 10,
    active: true,
    expiresAt: null,
    maxUses: 5,
    usedCount: 0,
    ...over,
  };
}

// ── Cupones ──────────────────────────────────────────────────────────────────

test("la regla del cupón: % sobre lo que se compra, fijo sin pasarse, y los rechazos con su porqué", () => {
  assert.deepEqual(aplicarCupon({ cupon: cupon(), base: 15500, ahora: AHORA }), { ok: true, codigo: "VERANO10", descuento: 1550 });
  assert.deepEqual(aplicarCupon({ cupon: cupon({ type: "FIXED", value: 20000 }), base: 15500, ahora: AHORA }), {
    ok: true,
    codigo: "VERANO10",
    descuento: 15500,
  });
  const agotado = aplicarCupon({ cupon: cupon({ usedCount: 5 }), base: 15500, ahora: AHORA });
  assert.equal(agotado.ok, false);
  assert.match(agotado.ok ? "" : agotado.error, /ya se usó todas las veces/);
  const vencido = aplicarCupon({ cupon: cupon({ expiresAt: new Date("2026-09-23T02:59:59.999Z") }), base: 15500, ahora: AHORA });
  assert.match(vencido.ok ? "" : vencido.error, /venció el 22\/09\/2026/);
  assert.equal(aplicarCupon({ cupon: cupon({ active: false }), base: 15500, ahora: AHORA }).ok, false);
  assert.equal(aplicarCupon({ cupon: null, base: 15500, ahora: AHORA }).ok, false);
  assert.equal(montoDeCupon("PERCENT", 10, 20000), 2000, "la pantalla recalcula igual que el servidor");
});

/** Base falsa de cupones: la fila del cupón y el compare-and-set del consumo. */
function txCupon(fila: ReturnType<typeof cupon> | null, opts: { otraVentaSeAdelanta?: boolean } = {}) {
  const llamadas: { op: string; args: Record<string, unknown> }[] = [];
  let adelanto = opts.otraVentaSeAdelanta ?? false;
  const tx = {
    coupon: {
      findFirst: async (args: Record<string, unknown>) => {
        llamadas.push({ op: "findFirst", args });
        return fila ? { ...fila } : null;
      },
      updateMany: async (args: { where: { usedCount: number } }) => {
        llamadas.push({ op: "updateMany", args });
        if (!fila) return { count: 0 };
        // Otra venta gastó un uso entre la lectura y esta escritura: el `where` ya no coincide.
        if (adelanto) {
          adelanto = false;
          fila.usedCount += 1;
          return { count: 0 };
        }
        if (args.where.usedCount !== fila.usedCount) return { count: 0 };
        fila.usedCount += 1;
        return { count: 1 };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, llamadas };
}

test("cupón en la venta: se consume con compare-and-set y el total queda con el descuento", async () => {
  const alta = decidirAlta({ tenantId: "t_magra", input: VENTA, products: [VACIO], opts: { cupon: " verano10 " } });
  assert.equal(alta.cupon, "VERANO10");
  const fila = cupon();
  const { tx, llamadas } = txCupon(fila);
  const r = await aplicarCuponEnTx(tx, alta, AHORA);
  assert.deepEqual([r.descuento, r.total, r.cuponAplicado], [1550, 13950, "VERANO10"]);
  assert.equal(fila.usedCount, 1);
  const consumo = llamadas.find((l) => l.op === "updateMany")!;
  assert.deepEqual(consumo.args.where, whereConsumoDeCupon("t_magra", { id: "cup_1", usedCount: 0 }));
  assert.deepEqual(consumo.args.data, { usedCount: { increment: 1 } });
  // La regla del cupón viaja con el alta, para escribirla junto al pedido.
  // El id de la fila va para que la anulación devuelva el uso a ESE cupón.
  assert.deepEqual(r.cuponDelPedido, { codigo: "VERANO10", tipo: "PERCENT", valor: 10, cuponId: "cup_1" });
});

test("la regla del cupón (% o FIJO) se escribe en la transacción del alta, en la fila del pedido; sin cupón, nada", async () => {
  // Un cupón FIJO de $2.000: el alta lo devuelve como FIJO, no como el % que resultó.
  const alta = decidirAlta({ tenantId: "t_magra", input: VENTA, products: [VACIO], opts: { cupon: "BIENVENIDA" } });
  const { tx } = txCupon(cupon({ code: "BIENVENIDA", type: "FIXED", value: 2000, maxUses: null }));
  const r = await aplicarCuponEnTx(tx, alta, AHORA);
  assert.deepEqual([r.descuento, r.cuponDelPedido], [2000, { codigo: "BIENVENIDA", tipo: "FIXED", valor: 2000, cuponId: "cup_1" }]);

  const escritas: Record<string, unknown>[] = [];
  const txAudit = {
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        escritas.push(args.data);
        return { id: "al_1" };
      },
    },
  } as unknown as Prisma.TransactionClient;
  await registrarCuponDelPedidoEnTx(txAudit, { tenantId: "t_magra", orderId: "ord_9", cupon: r.cuponDelPedido, monto: r.descuento });
  assert.equal(escritas.length, 1);
  const fila = escritas[0];
  assert.deepEqual(
    [fila.tenantId, fila.entity, fila.entityId, fila.action],
    ["t_magra", "Order", "ord_9", ACCION_CUPON_DEL_PEDIDO],
  );
  // Lo que después lee «Pesar y ajustar».
  assert.deepEqual(leerCuponDelPedido(fila.changes), { codigo: "BIENVENIDA", tipo: "FIXED", valor: 2000 });

  // La venta sin cupón no escribe nada.
  const sinCupon = await aplicarCuponEnTx(tx, decidirAlta({ tenantId: "t_magra", input: VENTA, products: [VACIO] }), AHORA);
  await registrarCuponDelPedidoEnTx(txAudit, { tenantId: "t_magra", orderId: "ord_10", cupon: sinCupon.cuponDelPedido, monto: sinCupon.descuento });
  assert.equal(escritas.length, 1);
});

test("cupón al máximo de usos → rechazo; y el último uso no lo gastan dos ventas a la vez", async () => {
  const alta = decidirAlta({ tenantId: "t_magra", input: VENTA, products: [VACIO], opts: { cupon: "VERANO10" } });
  await assert.rejects(aplicarCuponEnTx(txCupon(cupon({ usedCount: 5 })).tx, alta, AHORA), (e) => {
    assert.ok(e instanceof CuponRechazado);
    assert.match(e.message, /ya se usó todas las veces/);
    return true;
  });
  // Quedaba 1 uso: otra venta lo gasta entre la lectura y la escritura. Se vuelve a leer y rechaza.
  const fila = cupon({ usedCount: 4 });
  const { tx, llamadas } = txCupon(fila, { otraVentaSeAdelanta: true });
  await assert.rejects(aplicarCuponEnTx(tx, alta, AHORA), CuponRechazado);
  assert.equal(fila.usedCount, 5, "el uso lo gastó la otra venta, no ésta");
  assert.deepEqual(llamadas.map((l) => l.op), ["findFirst", "updateMany", "findFirst"]);
});

// El freno de los cupones públicos se prueba en src/lib/cupones/prueba-publica.test.ts.

test("un cupón y un descuento a mano no se suman", () => {
  assert.throws(
    () =>
      decidirAlta({
        tenantId: "t",
        input: VENTA,
        products: [VACIO],
        opts: { cupon: "VERANO10", descuento: { pedido: { tipo: "porcentaje", valor: 5 }, topePct: 10 } },
      }),
    new RegExp(CUPON_Y_DESCUENTO.slice(0, 20)),
  );
});

// ── A cuenta ─────────────────────────────────────────────────────────────────

test("a cuenta: el pedido queda saldado SIN medio y el libro no asienta nada", async () => {
  const alta = decidirAlta({
    tenantId: "t_magra",
    input: { ...VENTA, paid: false, paymentMethod: null },
    products: [VACIO],
    opts: { aCuenta: { createdBy: "user:u_dueña" }, imputarCajaActor: "user:u_dueña" },
  });
  const escritos: { modelo: string; op: string; args: Record<string, unknown> }[] = [];
  const anota = (modelo: string, op: string, r: unknown) => async (args: Record<string, unknown>) => {
    escritos.push({ modelo, op, args });
    return r;
  };
  const tx = {
    order: { findFirst: anota("order", "findFirst", { code: 9 }), create: anota("order", "create", { id: "ord_10", code: 10 }) },
    cashSession: { findFirst: anota("cashSession", "findFirst", { id: "sess" }) },
    cashMovement: { findFirst: anota("cashMovement", "findFirst", null), create: anota("cashMovement", "create", { id: "cm" }) },
  } as unknown as Prisma.TransactionClient;
  const datos = { ...alta, clientId: "cli_maria", writeKey: null };
  const creada = await crearOrdenEnTx(tx, datos);
  const caja = await imputarVentaEnTx(tx, datos, creada);
  const orden = escritos.find((e) => e.op === "create" && e.modelo === "order")!.args.data as Record<string, unknown>;
  assert.deepEqual([orden.paid, orden.paymentMethod, orden.total, orden.clientId], [true, null, 15500, "cli_maria"]);
  assert.equal(caja?.recorded, false, "no entró plata: el libro no se toca");
  assert.equal(escritos.some((e) => e.modelo === "cashMovement" && e.op === "create"), false);

  // El ticket lo dice, y no la marca como una venta cobrada con un medio.
  const venta = ventaDeOrden({
    id: "ord_10",
    code: 10,
    createdAt: AHORA,
    subtotal: 15500,
    discount: 0,
    total: 15500,
    paymentMethod: null,
    paid: true,
    customerName: "María",
    customerPhone: "",
    status: "DELIVERED",
    items: [],
  });
  assert.equal(venta.aCuenta, true);
  assert.ok(renglonesDelTicket(venta, { negocio: "MAGRA" }).some((r) => r.texto === "Queda a cuenta"));
});

/** Base falsa de la deuda de una venta a cuenta. */
function txDeuda(deuda: { id: string; amount: number; issueDate: Date } | null, cobros: number) {
  const escritos: { op: string; args: Record<string, unknown> }[] = [];
  const tx = {
    accountReceivable: {
      findFirst: async () => deuda,
      updateMany: async (args: Record<string, unknown>) => {
        escritos.push({ op: "updateMany", args });
        return { count: 1 };
      },
    },
    collection: { count: async () => cobros },
  } as unknown as Prisma.TransactionClient;
  return { tx, escritos };
}

const diaDe = (d: Date) => d.toISOString().slice(0, 10);

test("anular una venta a cuenta anula su deuda en la misma transacción; con cobros o de otro día (recepción), no", async () => {
  const deuda = { id: "ar_1", amount: 15500, issueDate: new Date("2026-09-23T13:00:00.000Z") };
  const ok = txDeuda(deuda, 0);
  assert.deepEqual(await anularCuentaDeLaVentaEnTx(ok.tx, "t_magra", "ord_10", { soloDelDia: null, diaDe }), { anulada: true, monto: 15500 });
  assert.deepEqual(ok.escritos[0].args, { where: { id: "ar_1", tenantId: "t_magra", status: "OPEN" }, data: { status: "VOID" } });

  await assert.rejects(anularCuentaDeLaVentaEnTx(txDeuda(deuda, 2).tx, "t_magra", "ord_10", { soloDelDia: null, diaDe }), AnulacionDeCuentaRechazada);
  await assert.rejects(
    anularCuentaDeLaVentaEnTx(txDeuda(deuda, 0).tx, "t_magra", "ord_10", { soloDelDia: "2026-09-24", diaDe }),
    /sólo se anulan las ventas de hoy/,
  );
  // Una venta que no fue a cuenta no tiene deuda: nada que hacer.
  assert.deepEqual(await anularCuentaDeLaVentaEnTx(txDeuda(null, 0).tx, "t_magra", "ord_11", { soloDelDia: null, diaDe }), {
    anulada: false,
    monto: 0,
  });
});

// ── Anular una venta a cuenta: el camino ENTERO de «Anular» ──────────────────
//
// `anularVentaConSuCuentaEnTx` es el cuerpo de la transacción de `anularVentaCore`
// (order-actions.ts): la venta y su deuda juntas. La base falsa hace lo que hace Postgres con
// una transacción: si algo tira, TODO vuelve a como estaba (copia antes, restaura al fallar).

type MundoACuenta = {
  order: { id: string; code: number; status: string; createdAt: Date; items: { productId: string; name: string; quantity: number; product: { trackStock: boolean } }[] };
  deuda: { id: string; amount: number; issueDate: Date; status: string };
  cobros: number;
  stock: number;
  caja: Record<string, unknown>[];
  stockMovs: Record<string, unknown>[];
};

function mundoACuenta(over: { issueDate?: Date; cobros?: number } = {}): MundoACuenta {
  const cuando = over.issueDate ?? new Date("2026-09-23T13:00:00.000Z");
  return {
    // Venta de mostrador a cuenta: nace entregada y saldada, SIN asiento en el libro.
    order: {
      id: "ord_10",
      code: 10,
      status: "DELIVERED",
      createdAt: cuando,
      items: [{ productId: "p_vacio", name: "Vacío", quantity: 1.24, product: { trackStock: true } }],
    },
    deuda: { id: "ar_10", amount: 15500, issueDate: cuando, status: "OPEN" },
    cobros: over.cobros ?? 0,
    stock: 8.76,
    caja: [],
    stockMovs: [],
  };
}

function txACuenta(m: MundoACuenta) {
  return {
    // Venta sin cupón: la anulación busca la fila del cupón del pedido y no hay.
    auditLog: { findFirst: async () => null },
    // Venta sin facturar (ENG-023): la anulación busca sus facturas y no hay.
    invoice: { findMany: async () => [] },
    order: {
      findFirst: async () => structuredClone(m.order),
      updateMany: async (a: { where: { status?: { not?: string } }; data: { status: string } }) => {
        if (a.where.status?.not === "CANCELLED" && m.order.status === "CANCELLED") return { count: 0 };
        m.order.status = a.data.status;
        return { count: 1 };
      },
    },
    cashMovement: {
      findFirst: async () => null,
      create: async (a: { data: Record<string, unknown> }) => {
        m.caja.push(a.data);
        return { id: `cm_${m.caja.length}` };
      },
    },
    product: {
      updateMany: async (a: { data: { stock: number | { increment: number } } }) => {
        m.stock = typeof a.data.stock === "number" ? a.data.stock : m.stock + a.data.stock.increment;
        return { count: 1 };
      },
      findUnique: async () => ({ stock: m.stock }),
    },
    stockMovement: {
      create: async (a: { data: Record<string, unknown> }) => {
        m.stockMovs.push(a.data);
        return a.data;
      },
    },
    $queryRaw: async () => [],
    accountReceivable: {
      findFirst: async (a: { where: { orderId: string; status: string } }) =>
        a.where.orderId === m.order.id && m.deuda.status === a.where.status ? { ...m.deuda } : null,
      updateMany: async (a: { where: { status: string }; data: { status: string } }) => {
        if (m.deuda.status !== a.where.status) return { count: 0 };
        m.deuda.status = a.data.status;
        return { count: 1 };
      },
    },
    collection: { count: async () => m.cobros },
  } as unknown as Prisma.TransactionClient;
}

/** Como `tenantTransaction`: si el cuerpo tira, la base queda como estaba. */
async function enTransaccion<T>(m: MundoACuenta, cuerpo: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const antes = structuredClone(m);
  try {
    return await cuerpo(txACuenta(m));
  } catch (e) {
    Object.assign(m, antes);
    throw e;
  }
}

/** El mismo orden que `anularVentaCore`: las reglas del rol, y después la transacción. */
async function anularComo(rol: "OWNER" | "RECEPTION", m: MundoACuenta, conCuentas = true) {
  const reglas = reglasDeAnulacion({ alcance: alcanceDeAnulacion(rol), motivo: "se cargó a la clienta equivocada", hoy: "2026-09-23" });
  assert.ok(reglas.ok);
  return enTransaccion(m, (tx) =>
    anularVentaConSuCuentaEnTx(
      tx,
      "t_magra",
      {
        orderId: "ord_10",
        motivo: reglas.motivo,
        actor: "user:u_caja",
        devuelveStock: true,
        diaCerradoHasta: null,
        esDiaCerrado: isFrozenDay,
        diaDe,
        soloDelDia: reglas.soloDelDia,
      },
      { conCuentas },
    ),
  );
}

test("anular una venta a cuenta (el camino entero): la venta, su deuda y el stock en la misma transacción; la caja no se toca", async () => {
  const m = mundoACuenta();
  const r = await anularComo("RECEPTION", m);
  assert.equal(r.venta.applied, true);
  assert.deepEqual(r.cuenta, { anulada: true, monto: 15500 });
  assert.equal(m.order.status, "CANCELLED");
  assert.equal(m.deuda.status, "VOID");
  assert.equal(m.stock, 10, "volvieron los 1,24 kg");
  assert.equal(m.caja.length, 0, "no había plata en el libro: no hay egreso");

  // Otra vez: ya estaba anulada, no se mueve nada más.
  const otra = await anularComo("RECEPTION", m);
  assert.equal(otra.venta.applied, false);
  assert.equal(m.stock, 10);
});

test("anular una venta a cuenta con cobros: se rechaza y NADA queda anulado (ni la venta ni el stock)", async () => {
  const m = mundoACuenta({ cobros: 1 });
  await assert.rejects(anularComo("OWNER", m), AnulacionDeCuentaRechazada);
  assert.equal(m.order.status, "DELIVERED", "la venta no puede quedar anulada con su deuda abierta");
  assert.equal(m.deuda.status, "OPEN");
  assert.equal(m.stock, 8.76);
  assert.equal(m.stockMovs.length, 0);
});

test("recepción no anula una venta a cuenta de ayer (no hay asiento que la frene: la frena la deuda), y vuelve todo atrás", async () => {
  const m = mundoACuenta({ issueDate: new Date("2026-09-22T13:00:00.000Z") });
  await assert.rejects(anularComo("RECEPTION", m), /sólo se anulan las ventas de hoy/);
  assert.deepEqual([m.order.status, m.deuda.status, m.stock], ["DELIVERED", "OPEN", 8.76]);
  // La dueña sí.
  const r = await anularComo("OWNER", m);
  assert.deepEqual([r.cuenta.anulada, m.order.status, m.deuda.status], [true, "CANCELLED", "VOID"]);
});

test("con cuentas corrientes apagadas, anular no mira deudas", async () => {
  const m = mundoACuenta();
  const r = await anularComo("OWNER", m, false);
  assert.deepEqual(r.cuenta, { anulada: false, monto: 0 });
  assert.equal(m.order.status, "CANCELLED");
  assert.equal(m.deuda.status, "OPEN");
});

// ── El tope del precio a mano ────────────────────────────────────────────────

const CATALOGO = [
  { name: "Vacío", saleUnit: "WEIGHT", price: null, pricePerKg: 12500 },
  { name: "Chimichurri 250 g", saleUnit: "UNIT", price: 4000, pricePerKg: null },
  { name: "Bondiola", saleUnit: "WEIGHT", price: null, pricePerKg: null },
];

test("precio a mano de recepción: hasta 10 % menos que la lista, nunca por kilo con precio, y hasta $50.000 sin producto", () => {
  const tope = topeDePrecioAMano("RECEPTION");
  const linea = (nombre: string, importe: number) => ({ nombre, importe, motivo: "lo pidió el cliente" });
  // 10 % menos que $4.000 es $3.600: pasa justo; $3.599,99 no.
  assert.equal(controlarPrecioAMano({ linea: linea("chimichurri 250 G", 3600), catalogo: CATALOGO, tope }).ok, true);
  const baja = controlarPrecioAMano({ linea: linea("Chimichurri 250 g", 3599.99), catalogo: CATALOGO, tope });
  assert.equal(baja.ok, false);
  assert.match(baja.ok ? "" : baja.error, /hasta 10 % menos \(\$ ?3\.600,00\).*dueña/);
  // Por kilo y con precio: sin el peso no hay con qué comparar. Sin tildes, es el mismo nombre.
  const kilo = controlarPrecioAMano({ linea: linea("vacio", 20000), catalogo: CATALOGO, tope });
  assert.match(kilo.ok ? "" : kilo.error, /se vende por kilo/);
  // Bondiola no tiene precio cargado: es para lo que existe el precio a mano, hasta el máximo.
  assert.equal(controlarPrecioAMano({ linea: linea("Bondiola", 25000), catalogo: CATALOGO, tope }).ok, true);
  const alta = controlarPrecioAMano({ linea: linea("Bondiola", MAXIMO_A_MANO_RECEPCION + 1), catalogo: CATALOGO, tope });
  assert.match(alta.ok ? "" : alta.error, /llega hasta \$ ?50\.000,00/);
  // La dueña no tiene tope.
  assert.equal(topeDePrecioAMano("OWNER"), null);
  assert.equal(controlarPrecioAMano({ linea: linea("Vacío", 1), catalogo: CATALOGO, tope: null }).ok, true);
});

test("el tope se controla DENTRO de la transacción, con el catálogo leído ahí", async () => {
  const leidas: Record<string, unknown>[] = [];
  const tx = {
    product: {
      findMany: async (args: Record<string, unknown>) => {
        leidas.push(args);
        return CATALOGO;
      },
    },
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(
    controlarPreciosAManoEnTx(tx, "t_magra", [{ nombre: "Vacío", importe: 1000, motivo: "cliente de siempre" }], topeDePrecioAMano("RECEPTION")),
    PrecioAManoRechazado,
  );
  assert.deepEqual((leidas[0] as { where: unknown }).where, { tenantId: "t_magra", deletedAt: null });
  // Sin líneas a mano, o sin tope, ni se lee el catálogo.
  await controlarPreciosAManoEnTx(tx, "t_magra", [], topeDePrecioAMano("RECEPTION"));
  await controlarPreciosAManoEnTx(tx, "t_magra", [{ nombre: "Vacío", importe: 1000, motivo: "x" }], null);
  assert.equal(leidas.length, 1);
});
