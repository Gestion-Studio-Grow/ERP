// ============================================================================
// PEDIDOS PARA PREPARAR — pesar y ajustar, el horario, el aviso y el paso siguiente.
// ============================================================================
//
// El criterio del brief: "un pedido online de 0,5 kg se pesa y ajusta a 1,240 kg antes de
// cobrar → cambian el total y el stock". Se ejecutan las funciones REALES que usa
// `updateOrderItems` (`lineasDelAjuste`, `totalesDelAjuste`, `deltasDeStock`,
// `planEdicionDeLineas`) con los números de MAGRA, la transacción entera (`ajustarPedidoInTx`)
// contra una base falsa que anota qué se escribe, y las funciones de la tarjeta de la bandeja.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineasDelAjuste,
  totalesDelAjuste,
  deltasDeStock,
  planEdicionDeLineas,
  detalleStockAjustadoPorEdicion,
  siguienteEstado,
  verboDelPaso,
  horarioDelFormulario,
  etiquetaDeHorario,
  avisoPedidoListo,
  ajustarPedidoInTx,
  EDICION_ACTOR_PREFIX,
  type AnulacionVentaTx,
  type LineaGuardada,
  type ProductoDelAjuste,
} from "@/lib/order-anulacion";
import {
  aplicarDescuento,
  descuentoDelAjuste,
  textoDelDescuentoDelAjuste,
  TOPE_DESCUENTO_RECEPCION_PCT,
} from "@/app/admin/(dashboard)/vender/reglas-venta";
import {
  aplicarCupon,
  cambiosDelCuponDelPedido,
  leerCuponDelPedido,
  whereCuponDelPedido,
  ACCION_CUPON_DEL_PEDIDO,
  type CuponDelPedido,
} from "@/lib/venta-reglas";
import { permiteVenderSinStock } from "@/lib/stock/pos-stock-rules";
import type { RecordMovementArgs } from "@/lib/stock/ledger";
import { waLinkClienta } from "@/lib/whatsapp-cta";

const VACIO_HOY: ProductoDelAjuste = {
  id: "p_vacio",
  name: "Vacío",
  saleUnit: "WEIGHT",
  price: null,
  // La dueña lo aumentó entre el pedido y el envasado: el pedido se cobra al precio que se dijo.
  pricePerKg: 13900,
  trackStock: true,
  vendible: true,
};

const PEDIDO_ONLINE: LineaGuardada[] = [
  { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 0.5, unitPrice: 12500, lineTotal: 6250 },
];

test("pedido online de 0,5 kg pesado a 1,240: el total pasa de $6.250 a $15.500 y el stock baja 0,74", () => {
  const plan = planEdicionDeLineas({ existe: true, paid: false, status: "PREPARING", tieneAsientoDeCaja: false, lineasValidas: 1 });
  assert.deepEqual(plan, { ok: true });

  const { lineas, aMano } = lineasDelAjuste(PEDIDO_ONLINE, [VACIO_HOY], [{ productId: "p_vacio", qty: 1.24 }]);
  assert.deepEqual(aMano, []);
  assert.deepEqual(lineas, [
    {
      productId: "p_vacio",
      name: "Vacío",
      saleUnit: "WEIGHT",
      quantity: 1.24,
      unitPrice: 12500, // el del pedido, no los $13.900 de hoy
      lineTotal: 15500,
      trackStock: true,
    },
  ]);
  assert.deepEqual(totalesDelAjuste(lineas, aMano, { descuento: 0, subtotal: 6250 }), {
    subtotal: 15500,
    descuento: 0,
    total: 15500,
  });

  const deltas = deltasDeStock(
    PEDIDO_ONLINE.map((l) => ({ productId: l.productId, quantity: l.quantity, trackStock: true })),
    lineas,
  );
  assert.deepEqual(deltas, [{ productId: "p_vacio", delta: 0.74 }]);
  assert.equal(detalleStockAjustadoPorEdicion(7, "Vacío", 0.74), "Peso real del pedido #7 · Vacío: salen 0,74");
});

test("pesar un pedido de la tienda con envío y cupón: el envío no es base del descuento (camino del servidor)", () => {
  // $20.000 de vacío + la línea de envío de $3.500 (sin producto, con el nombre reservado), con
  // un cupón del 10 % sobre lo que se compra ($2.000). Se pesa a $10.000 de vacío. Es lo que
  // hace `ajustarPedidoInTx`: `lineasDelAjuste` conserva la línea de envío entre las «a mano» y
  // `totalesDelAjuste` la saca de la base. Antes del arreglo: descuento $1.148,94.
  const existentes: LineaGuardada[] = [
    { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.6, unitPrice: 12500, lineTotal: 20000 },
    { productId: null, name: "Envío a domicilio", saleUnit: "UNIT", quantity: 1, unitPrice: 3500, lineTotal: 3500 },
  ];
  const { lineas, aMano } = lineasDelAjuste(existentes, [VACIO_HOY], [{ productId: "p_vacio", qty: 0.8 }]);
  assert.deepEqual(aMano.map((l) => [l.name, l.lineTotal]), [["Envío a domicilio", 3500]]);
  assert.deepEqual(totalesDelAjuste(lineas, aMano, { descuento: 2000, subtotal: 23500 }), {
    subtotal: 13500,
    descuento: 1000,
    total: 12500,
  });
});

test("ya cobrado no se pesa: se anula y se rehace", () => {
  assert.deepEqual(
    planEdicionDeLineas({ existe: true, paid: true, status: "READY", tieneAsientoDeCaja: true, lineasValidas: 1 }),
    { ok: false, motivo: "ya-cobrada" },
  );
});

test("el ajuste conserva las líneas con precio a mano y el descuento; lo nuevo entra al precio de hoy sólo si se vende", () => {
  const existentes: LineaGuardada[] = [
    ...PEDIDO_ONLINE,
    { productId: null, name: "Bondiola", saleUnit: "UNIT", quantity: 1, unitPrice: 5000, lineTotal: 5000 },
  ];
  const entrana: ProductoDelAjuste = { id: "p_entrana", name: "Entraña", saleUnit: "WEIGHT", price: null, pricePerKg: 17500, trackStock: true, vendible: true };
  const inactivo: ProductoDelAjuste = { id: "p_viejo", name: "Matambre", saleUnit: "WEIGHT", price: null, pricePerKg: 9000, trackStock: true, vendible: false };
  const { lineas, aMano } = lineasDelAjuste(existentes, [VACIO_HOY, entrana, inactivo], [
    { productId: "p_vacio", qty: 1.24 },
    { productId: "p_entrana", qty: 0.95 },
    { productId: "p_viejo", qty: 1 }, // no estaba en el pedido y hoy no se vende: no entra
    { productId: "p_fantasma", qty: 1 }, // no es del negocio: no entra
  ]);
  assert.deepEqual(lineas.map((l) => [l.productId, l.unitPrice, l.lineTotal]), [
    ["p_vacio", 12500, 15500],
    ["p_entrana", 17500, 16625],
  ]);
  assert.deepEqual(aMano.map((l) => l.name), ["Bondiola"]);
  // Tenía $6.250 + $5.000 a mano = $11.250 con el 10 % ($1.125). Queda $32.125 + $5.000 =
  // $37.125, y el descuento sigue siendo el 10 %: $3.712,50.
  assert.deepEqual(totalesDelAjuste(lineas, aMano, { descuento: 1125, subtotal: 11250 }), {
    subtotal: 37125,
    descuento: 3712.5,
    total: 33412.5,
  });
});

// ── El descuento en el ajuste: el % de la venta, no los pesos ────────────────
//
// Antes el ajuste conservaba el descuento EN PESOS (topeado al subtotal nuevo). Recepción
// cargaba 10 kg de vacío ($125.000) con el 10 % ($12.500), el alta lo aceptaba, y al pesar
// y ajustar a 1 kg el pedido quedaba {subtotal 12.500, descuento 12.500, total 0}: un 100 %.

const DIEZ_KG: LineaGuardada[] = [
  { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 10, unitPrice: 12500, lineTotal: 125000 },
];

test("recepción: 10 kg con el 10 % pesados a 1 kg quedan con el 10 % ($1.250), no en $0", () => {
  // El alta: 10 % de recepción sobre $125.000 pasa el tope.
  const alta = aplicarDescuento({
    subtotal: 125000,
    pedido: { tipo: "porcentaje", valor: 10 },
    topePct: TOPE_DESCUENTO_RECEPCION_PCT,
  });
  assert.deepEqual(alta, { ok: true, descuento: 12500, total: 112500, porcentaje: 10 });

  for (const [kg, esperado] of [
    [1, { subtotal: 12500, descuento: 1250, total: 11250 }],
    [0.5, { subtotal: 6250, descuento: 625, total: 5625 }],
    [1.5, { subtotal: 18750, descuento: 1875, total: 16875 }],
  ] as const) {
    const { lineas, aMano } = lineasDelAjuste(DIEZ_KG, [VACIO_HOY], [{ productId: "p_vacio", qty: kg }]);
    const t = totalesDelAjuste(lineas, aMano, { descuento: 12500, subtotal: 125000 });
    assert.deepEqual(t, esperado, `${kg} kg`);
    // Y lo que queda lo aceptaría el alta con el tope de recepción: el ajuste no crea un
    // descuento que el mostrador no habría dejado pasar.
    const mismoControl = aplicarDescuento({
      subtotal: t.subtotal,
      pedido: { tipo: "monto", valor: t.descuento },
      topePct: TOPE_DESCUENTO_RECEPCION_PCT,
    });
    assert.equal(mismoControl.ok, true, `${kg} kg pasa el tope`);
  }
});

test("el descuento del ajuste: sube con el pedido al mismo %, nunca pasa del subtotal ni se inventa", () => {
  // Pesó más: 0,5 → 1,240 con el 10 % → sigue el 10 %.
  assert.deepEqual(descuentoDelAjuste({ descuentoAntes: 625, subtotalAntes: 6250, subtotalNuevo: 15500 }), {
    descuento: 1550,
    porcentaje: 10,
  });
  // La dueña (sin tope) había hecho el 100 %: sigue en 100 %, el total no queda negativo.
  assert.deepEqual(descuentoDelAjuste({ descuentoAntes: 6250, subtotalAntes: 6250, subtotalNuevo: 1000 }), {
    descuento: 1000,
    porcentaje: 100,
  });
  // Sin descuento, o sin subtotal anterior del que sacar el %: cero, no se inventa uno.
  assert.deepEqual(descuentoDelAjuste({ descuentoAntes: 0, subtotalAntes: 6250, subtotalNuevo: 15500 }), {
    descuento: 0,
    porcentaje: 0,
  });
  assert.deepEqual(descuentoDelAjuste({ descuentoAntes: 500, subtotalAntes: 0, subtotalNuevo: 15500 }), {
    descuento: 0,
    porcentaje: 0,
  });
});

// ── El cupón en el ajuste: se recalcula con SU regla ─────────────────────────
//
// El refutador de la ola 3 lo midió con las funciones reales: 1,6 kg de vacío a $12.500
// ($20.000) con un cupón FIJO de $2.000, pesado a 2,4 kg, quedaba {30.000, 3.000, 27.000} —el
// negocio regalaba $1.000— y pesado a 0,8 kg el cliente perdía la mitad del cupón. El alta
// guarda la regla del cupón (`registrarCuponDelPedidoEnTx`) y el ajuste la vuelve a aplicar.

const MAGRA_16: LineaGuardada[] = [
  { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.6, unitPrice: 12500, lineTotal: 20000 },
];
const FIJO_2000: CuponDelPedido = { codigo: "BIENVENIDA", tipo: "FIXED", valor: 2000 };
const DIEZ_POR_CIENTO: CuponDelPedido = { codigo: "VERANO10", tipo: "PERCENT", valor: 10 };

/** El cupón como lo decide el ALTA real (`aplicarCupon`), para partir del mismo descuento. */
function descuentoDelAlta(c: CuponDelPedido, base: number): number {
  const r = aplicarCupon({
    cupon: { code: c.codigo, type: c.tipo, value: c.valor, active: true, expiresAt: null, maxUses: null, usedCount: 0 },
    base,
    ahora: new Date("2026-09-23T15:00:00.000Z"),
  });
  assert.ok(r.ok);
  return r.descuento;
}

test("cupón FIJO de $2.000 en 1,6 kg de vacío: pesado a 2,4 kg o a 0,8 kg sigue descontando $2.000", () => {
  assert.equal(descuentoDelAlta(FIJO_2000, 20000), 2000);
  for (const [kg, esperado] of [
    [2.4, { subtotal: 30000, descuento: 2000, total: 28000 }],
    [0.8, { subtotal: 10000, descuento: 2000, total: 8000 }],
    [1.6, { subtotal: 20000, descuento: 2000, total: 18000 }],
  ] as const) {
    const { lineas, aMano } = lineasDelAjuste(MAGRA_16, [VACIO_HOY], [{ productId: "p_vacio", qty: kg }]);
    assert.deepEqual(totalesDelAjuste(lineas, aMano, { descuento: 2000, subtotal: 20000, cupon: FIJO_2000 }), esperado, `${kg} kg`);
  }
  // Sin la regla del cupón (un descuento a mano de $2.000), el ajuste sigue conservando el %.
  const { lineas, aMano } = lineasDelAjuste(MAGRA_16, [VACIO_HOY], [{ productId: "p_vacio", qty: 2.4 }]);
  assert.deepEqual(totalesDelAjuste(lineas, aMano, { descuento: 2000, subtotal: 20000 }), {
    subtotal: 30000,
    descuento: 3000,
    total: 27000,
  });
});

test("cupón FIJO con envío: el envío no es base, el cupón no se pasa de la compra y crece hasta su valor", () => {
  const conEnvio: LineaGuardada[] = [
    ...MAGRA_16,
    { productId: null, name: "Envío a domicilio", saleUnit: "UNIT", quantity: 1, unitPrice: 3500, lineTotal: 3500 },
  ];
  const pesar = (kg: number) => lineasDelAjuste(conEnvio, [VACIO_HOY], [{ productId: "p_vacio", qty: kg }]);
  let p = pesar(2.4);
  assert.deepEqual(totalesDelAjuste(p.lineas, p.aMano, { descuento: 2000, subtotal: 23500, cupon: FIJO_2000 }), {
    subtotal: 33500,
    descuento: 2000,
    total: 31500,
  });
  // 0,12 kg = $1.500 de vacío: el cupón de $2.000 no se pasa de lo que se compra (el envío se paga).
  p = pesar(0.12);
  assert.deepEqual(totalesDelAjuste(p.lineas, p.aMano, { descuento: 2000, subtotal: 23500, cupon: FIJO_2000 }), {
    subtotal: 5000,
    descuento: 1500,
    total: 3500,
  });
  // Y al revés: un pedido de $1.500 tomado con el cupón de $2.000 (el alta lo topeó a $1.500)
  // que pesa $3.000 recupera el cupón entero, no el 100 % de la compra.
  assert.equal(descuentoDelAlta(FIJO_2000, 1500), 1500);
  assert.deepEqual(descuentoDelAjuste({ descuentoAntes: 1500, subtotalAntes: 1500, subtotalNuevo: 3000, cupon: FIJO_2000 }), {
    descuento: 2000,
    porcentaje: 66.67,
  });
});

test("cupón de %: sigue siendo el mismo % de lo que se compra", () => {
  assert.equal(descuentoDelAlta(DIEZ_POR_CIENTO, 20000), 2000);
  const { lineas, aMano } = lineasDelAjuste(MAGRA_16, [VACIO_HOY], [{ productId: "p_vacio", qty: 2.4 }]);
  assert.deepEqual(totalesDelAjuste(lineas, aMano, { descuento: 2000, subtotal: 20000, cupon: DIEZ_POR_CIENTO }), {
    subtotal: 30000,
    descuento: 3000,
    total: 27000,
  });
});

test("la vista previa dice de dónde sale el descuento: el cupón fijo no es «el X % de la venta»", () => {
  const fijo = descuentoDelAjuste({ descuentoAntes: 2000, subtotalAntes: 20000, subtotalNuevo: 30000, cupon: FIJO_2000 });
  assert.match(textoDelDescuentoDelAjuste(fijo, FIJO_2000) ?? "", /^Cupón BIENVENIDA de \$\s?2\.000,00: −\$\s?2\.000,00$/);
  const pct = descuentoDelAjuste({ descuentoAntes: 2000, subtotalAntes: 20000, subtotalNuevo: 30000, cupon: DIEZ_POR_CIENTO });
  assert.match(textoDelDescuentoDelAjuste(pct, DIEZ_POR_CIENTO) ?? "", /^Cupón VERANO10 del 10 %: −\$\s?3\.000,00$/);
  // El descuento a mano, con el mismo texto de antes.
  const aMano = descuentoDelAjuste({ descuentoAntes: 2000, subtotalAntes: 20000, subtotalNuevo: 30000 });
  assert.match(textoDelDescuentoDelAjuste(aMano, null) ?? "", /^Descuento del 10 %, el de la venta: −\$\s?3\.000,00$/);
  assert.equal(textoDelDescuentoDelAjuste({ descuento: 0, porcentaje: 0 }, FIJO_2000), null);
});

test("la regla del cupón que escribe el alta se lee igual; una fila rota no inventa un cupón", () => {
  const cambios = cambiosDelCuponDelPedido(FIJO_2000, 2000);
  assert.deepEqual(cambios, { codigo: "BIENVENIDA", tipo: "FIXED", valor: 2000, monto: 2000 });
  // Como vuelve de la columna Json.
  assert.deepEqual(leerCuponDelPedido(JSON.parse(JSON.stringify(cambios))), FIJO_2000);
  for (const roto of [null, undefined, "x", {}, { codigo: "A", tipo: "OTRO", valor: 5 }, { codigo: "A", tipo: "FIXED", valor: 0 }, { codigo: "", tipo: "FIXED", valor: 5 }, { codigo: "A", tipo: "PERCENT", valor: "10" }]) {
    assert.equal(leerCuponDelPedido(roto), null, JSON.stringify(roto));
  }
  assert.deepEqual(whereCuponDelPedido("t_magra", "ord_7"), {
    tenantId: "t_magra",
    entity: "Order",
    action: ACCION_CUPON_DEL_PEDIDO,
    entityId: "ord_7",
  });
  assert.deepEqual(whereCuponDelPedido("t_magra", ["a", "b"]).entityId, { in: ["a", "b"] });
});

// ── La transacción entera, contra una base falsa ─────────────────────────────

type Fila = Record<string, unknown>;

/** Un pedido guardado + lo que el ajuste escribe. El stock se anota con el ledger inyectado. */
function baseDePedido(pedido: {
  paid?: boolean;
  status?: string;
  subtotal: number;
  discount: number;
  total: number;
  items: LineaGuardada[];
  conAsiento?: boolean;
  /** La fila que escribió el alta con la regla del cupón (`registrarCuponDelPedidoEnTx`). */
  cupon?: CuponDelPedido;
}) {
  const { cupon, ...guardado } = pedido;
  const m = {
    pedido: { id: "ord_7", code: 7, paid: false, status: "PREPARING", ...guardado },
    itemsBorrados: 0,
    itemsNuevos: [] as Fila[],
    actualizacion: null as Fila | null,
    stock: [] as RecordMovementArgs[],
    lecturasDeCupon: [] as Fila[],
  };
  const tx = {
    auditLog: {
      findFirst: async (args: { where: Fila }) => {
        m.lecturasDeCupon.push(args.where);
        const w = args.where;
        const esLaFila = cupon && w.tenantId === "t_magra" && w.entity === "Order" && w.action === ACCION_CUPON_DEL_PEDIDO && w.entityId === "ord_7";
        return esLaFila ? { changes: JSON.parse(JSON.stringify(cambiosDelCuponDelPedido(cupon, pedido.discount))) } : null;
      },
    },
    order: {
      findFirst: async () => ({
        ...m.pedido,
        items: m.pedido.items.map((it) => ({ ...it, product: it.productId ? { trackStock: true } : null })),
      }),
      updateMany: async (args: { data: Fila }) => {
        m.actualizacion = args.data;
        return { count: 1 };
      },
    },
    cashMovement: { findFirst: async () => (pedido.conAsiento ? { id: "cm_1" } : null) },
    product: {
      findMany: async () => [
        { id: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", price: null, pricePerKg: 13900, trackStock: true, active: true, deletedAt: null },
      ],
    },
    orderItem: {
      deleteMany: async () => {
        m.itemsBorrados += 1;
        return { count: 1 };
      },
      createMany: async (args: { data: Fila[] }) => {
        m.itemsNuevos = args.data;
        return { count: args.data.length };
      },
    },
  };
  const registrarStock = async (_tx: unknown, args: RecordMovementArgs) => {
    m.stock.push(args);
    return 0;
  };
  return { m, tx: tx as unknown as AnulacionVentaTx, registrarStock };
}

const argsDelAjuste = (qty: number) => ({
  orderId: "ord_7",
  pedidas: [{ productId: "p_vacio", qty }],
  actor: "user:recepcion",
  permiteNegativo: (saleUnit: string) => permiteVenderSinStock({ saleUnit, contexto: "EDICION_PESO_REAL" }),
});

test("ajustarPedidoInTx: el pedido de 10 kg con el 10 % pesado a 1 kg guarda 12.500 / 1.250 / 11.250 y devuelve 9 kg", async () => {
  const { m, tx, registrarStock } = baseDePedido({ subtotal: 125000, discount: 12500, total: 112500, items: DIEZ_KG });
  const r = await ajustarPedidoInTx(tx, "t_magra", argsDelAjuste(1), registrarStock);
  assert.deepEqual(m.actualizacion, { subtotal: 12500, discount: 1250, total: 11250 });
  assert.deepEqual(r, { code: 7, antes: 112500, descuentoAntes: 12500, subtotal: 12500, descuento: 1250, total: 11250 });
  assert.equal(m.itemsBorrados, 1);
  assert.deepEqual(
    m.itemsNuevos.map((l) => [l.productId, l.quantity, l.unitPrice, l.lineTotal, l.tenantId]),
    [["p_vacio", 1, 12500, 12500, "t_magra"]],
  );
  // Los 9 kg que no se llevan vuelven como AJUSTE positivo, firmados por quien pesó.
  assert.equal(m.stock.length, 1);
  assert.equal(m.stock[0].type, "AJUSTE");
  assert.equal(m.stock[0].qty, 9);
  assert.equal(m.stock[0].createdBy, `${EDICION_ACTOR_PREFIX}user:recepcion`);
  assert.equal(m.stock[0].orderId, "ord_7");
});

test("ajustarPedidoInTx: 0,5 kg pesado a 1,240 sale como VENTA de 0,74 que puede dejar el stock en negativo (por peso)", async () => {
  const { m, tx, registrarStock } = baseDePedido({ subtotal: 6250, discount: 0, total: 6250, items: PEDIDO_ONLINE });
  const r = await ajustarPedidoInTx(tx, "t_magra", argsDelAjuste(1.24), registrarStock);
  assert.deepEqual(m.actualizacion, { subtotal: 15500, discount: 0, total: 15500 });
  assert.equal(r.antes, 6250);
  assert.deepEqual(
    m.stock.map((s) => [s.type, s.qty, s.allowNegative, s.reason]),
    [["VENTA", 0.74, true, "Peso real del pedido #7 · Vacío: salen 0,74"]],
  );
});

test("ajustarPedidoInTx: con plata en el libro no toca nada, aunque el pedido diga que no se cobró", async () => {
  const { m, tx, registrarStock } = baseDePedido({
    subtotal: 6250,
    discount: 0,
    total: 6250,
    items: PEDIDO_ONLINE,
    conAsiento: true,
  });
  await assert.rejects(
    () => ajustarPedidoInTx(tx, "t_magra", argsDelAjuste(1.24), registrarStock),
    /ya está cobrado/,
  );
  assert.deepEqual([m.stock, m.itemsBorrados, m.actualizacion], [[], 0, null]);
});

test("ajustarPedidoInTx: el pedido de la tienda con el cupón FIJO de $2.000 pesado a 2,4 kg guarda 30.000 / 2.000 / 28.000", async () => {
  const { m, tx, registrarStock } = baseDePedido({
    subtotal: 20000,
    discount: 2000,
    total: 18000,
    items: MAGRA_16,
    cupon: FIJO_2000,
  });
  const r = await ajustarPedidoInTx(tx, "t_magra", argsDelAjuste(2.4), registrarStock);
  assert.deepEqual(m.actualizacion, { subtotal: 30000, discount: 2000, total: 28000 });
  assert.deepEqual(r, { code: 7, antes: 18000, descuentoAntes: 2000, subtotal: 30000, descuento: 2000, total: 28000 });
  // La regla se buscó en la fila del pedido, dentro del negocio.
  assert.deepEqual(m.lecturasDeCupon, [whereCuponDelPedido("t_magra", "ord_7")]);

  // Y a 0,8 kg, el cliente conserva el cupón entero.
  const abajo = baseDePedido({ subtotal: 20000, discount: 2000, total: 18000, items: MAGRA_16, cupon: FIJO_2000 });
  await ajustarPedidoInTx(abajo.tx, "t_magra", argsDelAjuste(0.8), abajo.registrarStock);
  assert.deepEqual(abajo.m.actualizacion, { subtotal: 10000, discount: 2000, total: 8000 });
});

test("ajustarPedidoInTx: sin fila de cupón el descuento es a mano (conserva el %); sin descuento no se busca", async () => {
  const aMano = baseDePedido({ subtotal: 20000, discount: 2000, total: 18000, items: MAGRA_16 });
  await ajustarPedidoInTx(aMano.tx, "t_magra", argsDelAjuste(2.4), aMano.registrarStock);
  assert.deepEqual(aMano.m.actualizacion, { subtotal: 30000, discount: 3000, total: 27000 });
  assert.equal(aMano.m.lecturasDeCupon.length, 1);

  const sinDescuento = baseDePedido({ subtotal: 6250, discount: 0, total: 6250, items: PEDIDO_ONLINE });
  await ajustarPedidoInTx(sinDescuento.tx, "t_magra", argsDelAjuste(1.24), sinDescuento.registrarStock);
  assert.deepEqual(sinDescuento.m.lecturasDeCupon, [], "el pedido sin descuento no suma una lectura");
});

test("un corte que ya estaba en el pedido se pesa aunque hoy se haya dejado de vender", () => {
  const { lineas } = lineasDelAjuste(PEDIDO_ONLINE, [{ ...VACIO_HOY, vendible: false, pricePerKg: null }], [
    { productId: "p_vacio", qty: 1.3 },
  ]);
  assert.deepEqual(lineas.map((l) => l.lineTotal), [16250]);
});

test("en comercio, Nuevo pasa directo a Preparando; en servicios (CH) sigue pasando por Confirmado", () => {
  assert.equal(siguienteEstado("PENDING", { comercio: true }), "PREPARING");
  assert.equal(verboDelPaso("PENDING", { comercio: true }), "Preparar");
  // CH: los mismos tres botones de siempre.
  assert.equal(siguienteEstado("PENDING", { comercio: false }), "CONFIRMED");
  assert.equal(verboDelPaso("PENDING", { comercio: false }), "Confirmar");
  assert.equal(verboDelPaso("CONFIRMED", { comercio: false }), "Pasar a preparación");
  assert.equal(verboDelPaso("PREPARING", { comercio: false }), "Marcar listo");
  // Listo se ENTREGA (pide el cobro): no es un avance simple. Los terminales no avanzan.
  for (const comercio of [true, false]) {
    assert.equal(siguienteEstado("READY", { comercio }), null);
    assert.equal(siguienteEstado("DELIVERED", { comercio }), null);
    assert.equal(siguienteEstado("CANCELLED", { comercio }), null);
  }
});

test("el horario del pedido se lee en la zona del negocio, no en la del servidor", () => {
  // Sábado 10:00 en Buenos Aires son las 13:00 UTC (antes quedaba guardado 10:00 UTC = 7:00 acá).
  assert.equal(horarioDelFormulario("2026-09-26T10:00")?.toISOString(), "2026-09-26T13:00:00.000Z");
  assert.equal(horarioDelFormulario(""), null);
  assert.equal(horarioDelFormulario("mañana a la tarde"), null);
  assert.equal(horarioDelFormulario("2026-13-40T10:00"), null);

  const hoy = "2026-09-23";
  assert.deepEqual(etiquetaDeHorario(new Date("2026-09-23T21:30:00.000Z"), "PICKUP", hoy), {
    texto: "Retira hoy 18:30",
    esHoy: true,
  });
  assert.deepEqual(etiquetaDeHorario(new Date("2026-09-24T13:00:00.000Z"), "DELIVERY", hoy), {
    texto: "Envío mañana 10:00",
    esHoy: false,
  });
  const lejos = etiquetaDeHorario(new Date("2026-09-26T13:00:00.000Z"), "PICKUP", hoy);
  assert.match(lejos.texto, /^Retira sáb 26\/09 10:00$/);
  // 23:30 del día anterior en Buenos Aires es 02:30 UTC de hoy: NO es "hoy".
  assert.equal(etiquetaDeHorario(new Date("2026-09-23T02:30:00.000Z"), "PICKUP", hoy).esHoy, false);
});

test("aviso de pedido listo: armado, 1 a 1 al número del cliente, sin inventar datos del local", () => {
  const texto = avisoPedidoListo({
    cliente: "María Pérez",
    code: 123,
    total: 15500,
    pagado: false,
    fulfillment: "PICKUP",
    direccionEnvio: null,
    negocio: "MAGRA Canning",
    direccionLocal: "Av. Provisional 1234, Canning",
    horarioLocal: "Lun a Sáb 10–20h",
  });
  assert.equal(
    texto,
    "Hola María, tu pedido #123 de MAGRA Canning ya está listo para retirar. Total a pagar: $15.500,00. " +
      "Te esperamos en Av. Provisional 1234, Canning (Lun a Sáb 10–20h). ¡Gracias!",
  );
  const sinLocal = avisoPedidoListo({
    cliente: "Mostrador",
    code: 9,
    total: 1,
    pagado: true,
    fulfillment: "DELIVERY",
    direccionEnvio: "Calle 1 123",
    negocio: "MAGRA",
    direccionLocal: null,
    horarioLocal: null,
  });
  assert.equal(sinLocal, "Hola, tu pedido #9 de MAGRA ya está listo y sale para Calle 1 123. Ya está pago. ¡Gracias!");
  const link = waLinkClienta("11 4000-7919", texto);
  assert.ok(link?.startsWith("https://wa.me/5491140007919?text="));
  assert.equal(decodeURIComponent(link!.split("text=")[1]), texto);
  // Un teléfono que no es un número de acá no abre WhatsApp a cualquiera: sin botón.
  assert.equal(waLinkClienta("123", texto), null);
});
