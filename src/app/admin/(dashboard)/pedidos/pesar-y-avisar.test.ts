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
import { aplicarDescuento, descuentoDelAjuste, TOPE_DESCUENTO_RECEPCION_PCT } from "@/app/admin/(dashboard)/vender/reglas-venta";
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
}) {
  const m = {
    pedido: { id: "ord_7", code: 7, paid: false, status: "PREPARING", ...pedido },
    itemsBorrados: 0,
    itemsNuevos: [] as Fila[],
    actualizacion: null as Fila | null,
    stock: [] as RecordMovementArgs[],
  };
  const tx = {
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
