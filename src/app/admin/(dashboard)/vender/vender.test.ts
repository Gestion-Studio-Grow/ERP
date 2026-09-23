// ============================================================================
// VENDER — las reglas del ticket, EJECUTADAS con los números del criterio de aceptación.
// ============================================================================
//
// El recorrido que fija el brief, con los precios de MAGRA en la base de QA (Vacío
// $12.500/kg, Entraña $17.500/kg):
//   · Vacío 1,240 kg + Entraña 0,950 kg, efectivo, "pagó con $50.000" → vuelto $17.875.
//   · Descuento del 10 % → el LIBRO asienta el total ($28.912,50), no el subtotal ($32.125).
//   · Descuento del 15 % con recepción → rechazo.
//   · Precio a mano sin motivo → rechazo.
// Sin base (ADR-026): las piezas reales del alta —`decidirAlta` (líneas, descuento y total),
// `crearOrdenEnTx` e `imputarVentaEnTx`, en el orden en que las llama `insertOrder`— corren
// contra una base falsa que anota qué se escribe.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOrderLines,
  decidirAlta,
  crearOrdenEnTx,
  imputarVentaEnTx,
  orderSubtotal,
  stockDecrementLines,
  type DatosDelAlta,
  type OrderInput,
} from "@/lib/order-core";
import type { Prisma } from "@/generated/prisma/client";
import {
  aplicarDescuento,
  calcularVuelto,
  descuentoDelFormulario,
  htmlDelTicket,
  lineasAManoDelFormulario,
  masVendidos,
  renglonesDelTicket,
  textoDelTicket,
  topeDeDescuento,
  validarLineaAMano,
  ventaDeOrden,
  TOPE_DESCUENTO_RECEPCION_PCT,
  LEYENDA_NO_FACTURA,
} from "./reglas-venta";

const VACIO = { id: "p_vacio", name: "Vacío", saleUnit: "WEIGHT" as const, price: null, pricePerKg: 12500, trackStock: true };
const ENTRANA = { id: "p_entrana", name: "Entraña", saleUnit: "WEIGHT" as const, price: null, pricePerKg: 17500, trackStock: true };

/** Las líneas y el subtotal del ticket del criterio, armados por el núcleo REAL del alta. */
function ticketDelCriterio() {
  const lines = buildOrderLines([VACIO, ENTRANA], [
    { productId: "p_vacio", qty: 1.24 },
    { productId: "p_entrana", qty: 0.95 },
  ]);
  return { lines, subtotal: orderSubtotal(lines) };
}

// ── Vuelto ──────────────────────────────────────────────────────────────────

test("Vacío 1,240 + Entraña 0,950, efectivo, pagó con $50.000 → vuelto $17.875", () => {
  const { lines, subtotal } = ticketDelCriterio();
  assert.deepEqual(lines.map((l) => l.lineTotal), [15500, 16625]);
  assert.equal(subtotal, 32125);
  assert.deepEqual(calcularVuelto(subtotal, "50.000"), { estado: "ok", vuelto: 17875 });
  // Como lo tipea el cajero: con o sin signo, con o sin punto de miles.
  assert.deepEqual(calcularVuelto(subtotal, "$50000"), { estado: "ok", vuelto: 17875 });
  assert.deepEqual(calcularVuelto(subtotal, "30.000"), { estado: "falta", falta: 2125 });
  assert.deepEqual(calcularVuelto(subtotal, ""), { estado: "sin-dato" });
  assert.deepEqual(calcularVuelto(subtotal, "cincuenta"), { estado: "invalido" });
  // Justo: vuelto cero, no "falta".
  assert.deepEqual(calcularVuelto(subtotal, "32.125"), { estado: "ok", vuelto: 0 });
});

// ── Descuento ───────────────────────────────────────────────────────────────

test("descuento del 10 % sobre $32.125: $3.212,50 y total $28.912,50, también para recepción", () => {
  const { subtotal } = ticketDelCriterio();
  const r = aplicarDescuento({
    subtotal,
    pedido: { tipo: "porcentaje", valor: 10 },
    topePct: topeDeDescuento("RECEPTION"),
  });
  assert.deepEqual(r, { ok: true, descuento: 3212.5, total: 28912.5, porcentaje: 10 });
  // El mismo 10 % cargado en pesos pasa: el tope se compara en pesos, sin rebote por centavos.
  const enPesos = aplicarDescuento({ subtotal, pedido: { tipo: "monto", valor: 3212.5 }, topePct: 10 });
  assert.equal(enPesos.ok, true);
});

test("descuento del 15 % con recepción → rechazo que dice hasta cuánto y a quién pedírselo", () => {
  const { subtotal } = ticketDelCriterio();
  assert.equal(topeDeDescuento("RECEPTION"), TOPE_DESCUENTO_RECEPCION_PCT);
  const r = aplicarDescuento({ subtotal, pedido: { tipo: "porcentaje", valor: 15 }, topePct: topeDeDescuento("RECEPTION") });
  assert.equal(r.ok, false);
  assert.ok(!r.ok);
  assert.match(r.error, /hasta el 10 %/);
  assert.match(r.error, /\$3\.212,50/);
  assert.match(r.error, /dueña o al dueño/);
  // Un peso por encima del 10 % también rebota.
  assert.equal(aplicarDescuento({ subtotal, pedido: { tipo: "monto", valor: 3213.5 }, topePct: 10 }).ok, false);
  // La dueña no tiene tope.
  assert.equal(topeDeDescuento("OWNER"), null);
  assert.deepEqual(aplicarDescuento({ subtotal, pedido: { tipo: "porcentaje", valor: 15 }, topePct: null }), {
    ok: true,
    descuento: 4818.75,
    total: 27306.25,
    porcentaje: 15,
  });
});

test("descuento imposible: más que la venta, más del 100 % o negativo → rechazo; vacío o 0 → sin descuento", () => {
  assert.equal(aplicarDescuento({ subtotal: 1000, pedido: { tipo: "monto", valor: 1500 }, topePct: null }).ok, false);
  assert.equal(aplicarDescuento({ subtotal: 1000, pedido: { tipo: "porcentaje", valor: 120 }, topePct: null }).ok, false);
  assert.equal(aplicarDescuento({ subtotal: 1000, pedido: { tipo: "monto", valor: -5 }, topePct: null }).ok, false);
  assert.deepEqual(aplicarDescuento({ subtotal: 1000, pedido: null, topePct: 10 }), {
    ok: true,
    descuento: 0,
    total: 1000,
    porcentaje: 0,
  });
  assert.deepEqual(descuentoDelFormulario("porcentaje", ""), { ok: true, pedido: null });
  assert.deepEqual(descuentoDelFormulario("porcentaje", "0"), { ok: true, pedido: null });
  assert.deepEqual(descuentoDelFormulario("porcentaje", "12,5"), { ok: true, pedido: { tipo: "porcentaje", valor: 12.5 } });
  assert.deepEqual(descuentoDelFormulario("monto", "3.212,50"), { ok: true, pedido: { tipo: "monto", valor: 3212.5 } });
  // Un tipo que no existe no se adivina como pesos: es porcentaje (el que tiene tope más chico).
  assert.deepEqual(descuentoDelFormulario("cualquiera", "10"), { ok: true, pedido: { tipo: "porcentaje", valor: 10 } });
  assert.equal(descuentoDelFormulario("monto", "diez").ok, false);
});

// ── El libro asienta el TOTAL ───────────────────────────────────────────────

type Escrito = { modelo: string; op: string; args: Record<string, unknown> };

/** Base falsa para el cuerpo del alta: anota cada escritura y contesta lo mínimo. */
function txFalsa(opts: { turnoAbierto?: string | null } = {}) {
  const escritos: Escrito[] = [];
  const anota = (modelo: string, op: string, r: (a: Record<string, unknown>) => unknown) => async (args: Record<string, unknown>) => {
    escritos.push({ modelo, op, args });
    return r(args);
  };
  const tx = {
    order: {
      findFirst: anota("order", "findFirst", () => ({ code: 41 })),
      create: anota("order", "create", () => ({ id: "ord_42", code: 42 })),
    },
    cashSession: {
      findFirst: anota("cashSession", "findFirst", () => (opts.turnoAbierto ? { id: opts.turnoAbierto } : null)),
    },
    cashMovement: {
      findFirst: anota("cashMovement", "findFirst", () => null),
      create: anota("cashMovement", "create", () => ({ id: "cm_venta" })),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, escritos };
}

const INPUT_EFECTIVO: OrderInput = {
  channel: "COUNTER",
  fulfillment: "PICKUP",
  customerName: "Mostrador",
  customerPhone: "",
  address: null,
  notes: null,
  scheduledFor: null,
  paid: true,
  paymentMethod: "EFECTIVO",
  items: [],
};

/** Lo que `insertOrder` escribe en la transacción: la orden y, si el mostrador cobró, el libro. */
async function alta(tx: Prisma.TransactionClient, d: DatosDelAlta) {
  const creada = await crearOrdenEnTx(tx, d);
  const cashSale = await imputarVentaEnTx(tx, d, creada);
  return { ...creada, cashSale };
}

/** El ticket del criterio como lo manda el mostrador: Vacío 1,240 + Entraña 0,950 en efectivo. */
const INPUT_DEL_CRITERIO: OrderInput = {
  ...INPUT_EFECTIVO,
  items: [
    { productId: "p_vacio", qty: 1.24 },
    { productId: "p_entrana", qty: 0.95 },
  ],
};

test("descuento del 10 %: el pedido guarda subtotal, descuento y total, y el LIBRO asienta el total", async () => {
  // El cableado REAL del alta: `decidirAlta` arma líneas, descuento y total con el tope de
  // recepción, y eso es lo que reciben la orden y el libro. Si el alta volviera a pasarle el
  // subtotal a la caja, este test lo ve.
  const decidida = decidirAlta({
    tenantId: "t_magra",
    input: INPUT_DEL_CRITERIO,
    products: [VACIO, ENTRANA],
    opts: {
      descuento: { pedido: { tipo: "porcentaje", valor: 10 }, topePct: topeDeDescuento("RECEPTION") },
      imputarCajaActor: "user:u_recepcion",
    },
  });
  assert.deepEqual([decidida.subtotal, decidida.descuento, decidida.total, decidida.status], [32125, 3212.5, 28912.5, "CONFIRMED"]);
  const subtotal = decidida.subtotal;
  const { tx, escritos } = txFalsa({ turnoAbierto: "sess_1" });
  const r = await alta(tx, { ...decidida, clientId: null, writeKey: "k1" });
  assert.equal(r.code, 42);
  assert.deepEqual(r.cashSale, { recorded: true, movementId: "cm_venta", sessionId: "sess_1", method: "EFECTIVO" });

  const orden = escritos.find((e) => e.modelo === "order" && e.op === "create")!.args.data as Record<string, unknown>;
  assert.equal(orden.subtotal, 32125);
  assert.equal(orden.discount, 3212.5);
  assert.equal(orden.total, 28912.5);
  assert.equal(orden.tenantId, "t_magra");
  assert.equal("clientId" in orden, false, "sin teléfono no se escribe ficha");

  const asiento = escritos.find((e) => e.modelo === "cashMovement" && e.op === "create")!.args.data as Record<string, unknown>;
  assert.equal(asiento.amount, 28912.5, "el libro asienta lo que se cobró, no el subtotal");
  assert.notEqual(asiento.amount, subtotal);
  assert.equal(asiento.method, "EFECTIVO");
  assert.equal(asiento.orderId, "ord_42");
});

test("el alta rechaza el 15 % de recepción antes de abrir la transacción; la tienda nace pendiente", () => {
  assert.throws(
    () =>
      decidirAlta({
        tenantId: "t_magra",
        input: INPUT_DEL_CRITERIO,
        products: [VACIO, ENTRANA],
        opts: { descuento: { pedido: { tipo: "porcentaje", valor: 15 }, topePct: topeDeDescuento("RECEPTION") } },
      }),
    /hasta el 10 % \(\$3\.212,50 en esta venta\)/,
  );
  // La tienda no manda descuento ni caja: total = subtotal, PENDING y sin imputar.
  const tienda = decidirAlta({
    tenantId: "t_magra",
    input: { ...INPUT_DEL_CRITERIO, channel: "ONLINE", paid: false, paymentMethod: null },
    products: [VACIO, ENTRANA],
  });
  assert.deepEqual([tienda.total, tienda.descuento, tienda.status, tienda.imputarCajaActor], [32125, 0, "PENDING", undefined]);
});

test("pedido sin cobrar o de la vidriera: no toca el libro", async () => {
  const { lines, subtotal } = ticketDelCriterio();
  const base: DatosDelAlta = {
    tenantId: "t_magra",
    status: "PENDING",
    input: { ...INPUT_EFECTIVO, channel: "ONLINE", paid: false, paymentMethod: null },
    clientId: null,
    subtotal,
    descuento: 0,
    total: subtotal,
    lines,
    aMano: [],
    writeKey: null,
  };
  const vidriera = txFalsa();
  assert.equal((await alta(vidriera.tx, base)).cashSale, undefined, "la vidriera no imputa caja");
  assert.equal(vidriera.escritos.some((e) => e.modelo === "cashMovement"), false);
  const sinCobrar = txFalsa();
  assert.deepEqual((await alta(sinCobrar.tx, { ...base, imputarCajaActor: "user:u" })).cashSale, {
    recorded: false,
    reason: "not-paid",
  });
});

test("precio a mano: la línea va sin producto, no mueve stock y suma al total del libro", async () => {
  const { lines } = ticketDelCriterio();
  const aMano = [{ nombre: "Bondiola", importe: 5000, motivo: "sin precio cargado" }];
  const subtotal = orderSubtotal(lines) + 5000;
  const { tx, escritos } = txFalsa();
  await alta(tx, {
    tenantId: "t_magra",
    status: "CONFIRMED",
    input: { ...INPUT_EFECTIVO, paymentMethod: "MERCADOPAGO" },
    clientId: "cli_7",
    subtotal,
    descuento: 0,
    total: subtotal,
    lines,
    aMano,
    imputarCajaActor: "user:u_duenia",
    writeKey: null,
  });
  const orden = escritos.find((e) => e.modelo === "order" && e.op === "create")!.args.data as {
    clientId?: string;
    items: { create: { productId: string | null; name: string; lineTotal: number; quantity: number }[] };
  };
  assert.equal(orden.clientId, "cli_7", "con ficha encontrada, el pedido queda vinculado");
  const manual = orden.items.create.find((i) => i.productId === null);
  assert.deepEqual(manual && { name: manual.name, lineTotal: manual.lineTotal, quantity: manual.quantity }, {
    name: "Bondiola",
    lineTotal: 5000,
    quantity: 1,
  });
  // Stock: `insertOrder` descuenta `stockDecrementLines(lines)`, y la línea a mano no está en
  // `lines` (no tiene producto): salen Vacío y Entraña, nada más.
  assert.deepEqual(stockDecrementLines(lines).map((l) => l.productId), ["p_vacio", "p_entrana"]);
  const asiento = escritos.find((e) => e.modelo === "cashMovement" && e.op === "create")!.args.data as Record<string, unknown>;
  assert.equal(asiento.amount, 37125);
  assert.equal(asiento.method, "MP");
});

test("precio a mano sin motivo → rechazo; y una línea mala rechaza la venta entera", () => {
  const sinMotivo = validarLineaAMano({ nombre: "Bondiola", importe: "5.000", motivo: "" });
  assert.equal(sinMotivo.ok, false);
  assert.ok(!sinMotivo.ok);
  assert.match(sinMotivo.error, /por qué «Bondiola» va con precio a mano/);
  assert.equal(validarLineaAMano({ nombre: "Bondiola", importe: "5.000", motivo: "no" }).ok, false, "motivo de 2 letras");
  assert.equal(validarLineaAMano({ nombre: "", importe: "5.000", motivo: "sin precio cargado" }).ok, false);
  assert.equal(validarLineaAMano({ nombre: "Bondiola", importe: "0", motivo: "sin precio cargado" }).ok, false);
  assert.equal(validarLineaAMano({ nombre: "Bondiola", importe: "abc", motivo: "sin precio cargado" }).ok, false);
  assert.deepEqual(validarLineaAMano({ nombre: "  Bondiola  ", importe: "5.000,50", motivo: " sin precio  cargado " }), {
    ok: true,
    linea: { nombre: "Bondiola", importe: 5000.5, motivo: "sin precio cargado" },
  });

  const campos: Record<string, string[]> = {
    manualNombre: ["Bondiola", "Chorizo"],
    manualImporte: ["5000", "3000"],
    manualMotivo: ["sin precio cargado", ""],
  };
  const r = lineasAManoDelFormulario((c) => campos[c] ?? []);
  assert.equal(r.ok, false, "la segunda no tiene motivo: no se descarta en silencio, se rechaza todo");
  assert.deepEqual(lineasAManoDelFormulario(() => []), { ok: true, lineas: [] });
});

// ── Botones rápidos ─────────────────────────────────────────────────────────

test("los 8 más vendidos: sin líneas a mano ni productos que ya no se venden, de más a menos", () => {
  const grupos = [
    { productId: "a", _count: { _all: 3 } },
    { productId: null, _count: { _all: 50 } },
    { productId: "borrado", _count: { _all: 40 } },
    { productId: "b", _count: { _all: 9 } },
    ...Array.from({ length: 10 }, (_, i) => ({ productId: `x${i}`, _count: { _all: 1 } })),
  ];
  const vendibles = new Set(["a", "b", ...Array.from({ length: 10 }, (_, i) => `x${i}`)]);
  const r = masVendidos(grupos, vendibles);
  assert.equal(r.length, 8);
  assert.deepEqual(r.slice(0, 3), ["b", "a", "x0"]);
  assert.ok(!r.includes("borrado"));
  assert.deepEqual(masVendidos([], vendibles), []);
});

// ── El ticket ───────────────────────────────────────────────────────────────

const ORDEN = {
  id: "ord_42",
  code: 42,
  createdAt: new Date("2026-09-23T13:15:00.000Z"),
  subtotal: 32125,
  discount: 3212.5,
  total: 28912.5,
  paymentMethod: "EFECTIVO",
  customerName: "Mostrador",
  customerPhone: "",
  status: "DELIVERED",
  items: [
    { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.24, unitPrice: 12500, lineTotal: 15500 },
    { productId: "p_entrana", name: "Entraña", saleUnit: "WEIGHT", quantity: 0.95, unitPrice: 17500, lineTotal: 16625 },
    { productId: null, name: "Bolsa <térmica>", saleUnit: "UNIT", quantity: 1, unitPrice: 500, lineTotal: 500 },
  ],
};

test("ticket: kilos con coma, descuento, vuelto y 'No válido como factura'; la venta anónima no dice 'Mostrador'", () => {
  const v = ventaDeOrden(ORDEN);
  assert.equal(v.cliente, null);
  assert.equal(v.lineas[2].aMano, true);
  const texto = textoDelTicket(v, { negocio: "MAGRA Canning", pagoCon: 50000 });
  assert.match(texto, /\*MAGRA Canning\*/);
  assert.match(texto, /Ticket #42 · 23\/09\/2026 10:15/);
  assert.match(texto, /1,24 kg × \$12\.500,00\/kg/);
  assert.match(texto, /0,95 kg × \$17\.500,00\/kg/);
  assert.doesNotMatch(texto, /1\.24|0\.95/, "nunca el punto decimal en una cantidad");
  assert.match(texto, /Descuento \(10 %\): −\$3\.212,50/);
  assert.match(texto, /\*TOTAL: \$28\.912,50\*/);
  assert.match(texto, /Vuelto: \$21\.087,50/);
  assert.ok(texto.trim().endsWith(LEYENDA_NO_FACTURA));
});

test("ticket impreso: 58 mm y el texto que tipeó una persona va escapado", () => {
  const html = htmlDelTicket(renglonesDelTicket(ventaDeOrden(ORDEN), { negocio: "MAGRA <b>" }));
  assert.match(html, /size:58mm auto/);
  assert.match(html, /MAGRA &lt;b&gt;/);
  assert.match(html, /Bolsa &lt;térmica&gt;/);
  assert.doesNotMatch(html, /<térmica>/);
  assert.match(html, /No válido como factura/);
});
