// El reintento de una venta con una clave ya grabada: el servidor COMPARA lo que llega con lo
// grabado (reintento-de-venta.ts) y decide si es la misma venta. Se ejecutan las decisiones con
// los casos del refutador (R1 cliente de una venta a cuenta, R2 entrega de un pedido, R4 cupón
// cambiado por un % a mano del mismo monto) y la frontera entre "no se cobró" y "no sabemos"
// (`motivoDelRechazoDelAlta`, order-core.ts) con instancias REALES de los errores de Prisma.
// Contra la base (lo que llega de verdad del alta y lo que se lee de las filas):
// reintento-de-venta-postgres.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import {
  contenidoGrabado,
  contenidoPedido,
  diferenciasConLoGrabado,
  mensajeDeYaGrabadaIgual,
  textoDeYaGrabada,
  tituloDeYaGrabada,
  detalleDeYaGrabada,
  type AltaPedida,
  type VentaGrabadaLeida,
  type VentaYaGrabada,
} from "./reintento-de-venta";
import { CuponRechazado, PrecioAManoRechazado, motivoDelRechazoDelAlta, esRechazoDelAlta } from "./order-core";
import { RechazoDeDominio } from "./rechazo-de-dominio";
import { RechazoDelStock } from "./stock/ledger";

// La venta de María, a cuenta: Vacío 1,240 kg a $12.500/kg = $15.500.
const grabadaMaria: VentaGrabadaLeida = {
  channel: "COUNTER",
  fulfillment: "PICKUP",
  customerName: "María Pérez",
  customerPhone: "11 4000 0000",
  clientId: "cli_maria",
  address: null,
  scheduledFor: null,
  notes: null,
  discount: 0,
  total: 15500,
  paid: true,
  paymentMethod: null,
  items: [{ productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.24, unitPrice: 12500 }],
  cupon: null,
};

function alta(p: Partial<AltaPedida["input"]> & { clientId?: string | null; lines?: AltaPedida["lines"]; aCuenta?: boolean; descuento?: number; cupon?: string | null; aMano?: AltaPedida["aMano"] }): AltaPedida {
  const lines = p.lines ?? [{ productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.24, unitPrice: 12500 }];
  const aMano = p.aMano ?? [];
  const subtotal = lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPrice * 100) / 100, 0) + aMano.reduce((s, m) => s + m.importe, 0);
  const descuento = p.descuento ?? 0;
  return {
    input: {
      channel: p.channel ?? "COUNTER",
      fulfillment: p.fulfillment ?? "PICKUP",
      customerName: p.customerName ?? "María Pérez",
      customerPhone: p.customerPhone ?? "11 4000 0000",
      address: p.address ?? null,
      notes: p.notes ?? null,
      scheduledFor: p.scheduledFor ?? null,
      paid: p.paid ?? false,
      paymentMethod: p.paymentMethod ?? null,
    },
    lines,
    aMano,
    subtotal,
    descuento,
    total: subtotal - descuento,
    cupon: p.cupon ?? null,
    ...(p.aCuenta === false ? {} : { aCuenta: { createdBy: "user:u1" } }),
    clientId: p.clientId === undefined ? "cli_maria" : p.clientId,
  };
}

test("el mismo reintento, con el teléfono escrito de otra forma: es la misma venta", () => {
  const d = diferenciasConLoGrabado(contenidoGrabado(grabadaMaria), contenidoPedido(alta({ customerPhone: "1140000000" })));
  assert.deepEqual(d, []);
});

test("R1 — a cuenta: el reintento viene con OTRO cliente → se dice, con los dos", () => {
  const d = diferenciasConLoGrabado(
    contenidoGrabado(grabadaMaria),
    contenidoPedido(alta({ customerPhone: "11 5000 0000", customerName: "Juan Gómez", clientId: "cli_juan" })),
  );
  assert.deepEqual(d, ["Cliente: se grabó María Pérez (11 4000 0000); ahora Juan Gómez (11 5000 0000)."]);
  // La misma persona con la ficha distinta (dos fichas con el mismo número): también es otra deuda.
  assert.equal(
    diferenciasConLoGrabado(contenidoGrabado(grabadaMaria), contenidoPedido(alta({ clientId: "cli_otra" }))).length,
    1,
  );
  // Sólo el nombre escrito distinto, mismo teléfono y ficha: se dice como nombre.
  assert.deepEqual(diferenciasConLoGrabado(contenidoGrabado(grabadaMaria), contenidoPedido(alta({ customerName: "María P." }))), [
    "Nombre del cliente: se grabó «María Pérez»; ahora «María P.».",
  ]);
  // A cuenta → efectivo: la plata y la deuda cambian.
  assert.deepEqual(
    diferenciasConLoGrabado(contenidoGrabado(grabadaMaria), contenidoPedido(alta({ aCuenta: false, paid: true, paymentMethod: "EFECTIVO" }))),
    ["Cómo pagó: se grabó a cuenta; ahora en Efectivo."],
  );
});

// El pedido de María, envío a Av. Mitre 1234 el sábado 10:00, 2 kg de Vacío.
const sabado = new Date("2026-09-26T13:00:00.000Z");
const pedidoGrabado: VentaGrabadaLeida = {
  ...grabadaMaria,
  channel: "ONLINE",
  fulfillment: "DELIVERY",
  address: "Av. Mitre 1234",
  scheduledFor: sabado,
  notes: "en milanesas",
  discount: 0,
  total: 25000,
  paid: false,
  paymentMethod: null,
  items: [{ productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 2, unitPrice: 12500 }],
};
const lineas2kg = [{ productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 2, unitPrice: 12500 }];

test("R2 — pedido: entrega, dirección, horario, nota y nombre cambiados → una frase por cosa", () => {
  const igual = contenidoPedido(
    alta({ channel: "ONLINE", fulfillment: "DELIVERY", address: " Av.  Mitre 1234 ", scheduledFor: new Date(sabado), notes: "en milanesas", aCuenta: false, lines: lineas2kg }),
  );
  assert.deepEqual(diferenciasConLoGrabado(contenidoGrabado(pedidoGrabado), igual), [], "espacios de más no son otra dirección");
  const d = diferenciasConLoGrabado(
    contenidoGrabado(pedidoGrabado),
    contenidoPedido(alta({ channel: "ONLINE", fulfillment: "PICKUP", address: null, scheduledFor: null, notes: null, customerName: "Juana", aCuenta: false, lines: lineas2kg })),
  );
  assert.deepEqual(d, [
    "Nombre del cliente: se grabó «María Pérez»; ahora «Juana».",
    "Entrega: se grabó «envío a domicilio»; ahora «retira en el local».",
    "Dirección: se grabó «Av. Mitre 1234»; ahora sin dirección.",
    "Horario: se grabó 26/09/2026 10:00; ahora sin horario.",
    "Nota: se grabó «en milanesas»; ahora sin nota.",
  ]);
  // Venta ↔ pedido: otro canal.
  assert.match(
    diferenciasConLoGrabado(contenidoGrabado(pedidoGrabado), contenidoPedido(alta({ aCuenta: false, lines: lineas2kg })))[0],
    /^Se grabó como un pedido; ahora es una venta de mostrador\.$/,
  );
});

test("líneas: otro peso, otro precio, una de más, una de menos y el precio a mano", () => {
  const conBolsa: VentaGrabadaLeida = {
    ...grabadaMaria,
    total: 16000,
    items: [...grabadaMaria.items, { productId: null, name: "Bolsa", saleUnit: "UNIT", quantity: 1, unitPrice: 500 }],
  };
  const d = diferenciasConLoGrabado(
    contenidoGrabado(conBolsa),
    contenidoPedido(
      alta({
        lines: [
          { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 1.3, unitPrice: 13000 },
          { productId: "p_entrana", name: "Entraña", saleUnit: "WEIGHT", quantity: 0.95, unitPrice: 17500 },
        ],
        aMano: [{ nombre: "bolsa ", importe: 700 }],
      }),
    ),
  );
  assert.deepEqual(d, [
    "Vacío: se grabó 1,24 kg; ahora 1,3 kg.",
    "Vacío: se grabó a $12.500,00/kg; ahora $13.000,00/kg.",
    "Bolsa: se grabó $500,00; ahora no está.",
    "Entraña 0,95 kg: no está en la grabada.",
    "bolsa $700,00: no está en la grabada.",
    "Total: se grabó $16.000,00; ahora $34.225,00.",
  ]);
  // Dos renglones del mismo corte suman: 1 + 0,24 es lo mismo que 1,24.
  const partido = alta({
    lines: [
      { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 1, unitPrice: 12500 },
      { productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 0.24, unitPrice: 12500 },
    ],
  });
  assert.deepEqual(diferenciasConLoGrabado(contenidoGrabado(grabadaMaria), contenidoPedido(partido)), []);
});

test("R4 — el cupón cambiado por un 10 % a mano del MISMO monto no es la misma venta", () => {
  const conCupon: VentaGrabadaLeida = { ...grabadaMaria, paid: true, paymentMethod: "EFECTIVO", discount: 1250, total: 11250, cupon: "VERANO10", items: [{ ...grabadaMaria.items[0], quantity: 1 }] };
  const vacio1 = [{ productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity: 1, unitPrice: 12500 }];
  const aMano10 = alta({ lines: vacio1, aCuenta: false, paid: true, paymentMethod: "EFECTIVO", descuento: 1250 });
  assert.deepEqual(diferenciasConLoGrabado(contenidoGrabado(conCupon), contenidoPedido(aMano10)), [
    "Cupón: se grabó el cupón VERANO10; ahora sin cupón.",
  ]);
  // El mismo cupón, con el descuento calculado con la regla del grabado: igual.
  const mismo = alta({ lines: vacio1, aCuenta: false, paid: true, paymentMethod: "EFECTIVO", cupon: "VERANO10" });
  assert.deepEqual(diferenciasConLoGrabado(contenidoGrabado(conCupon), contenidoPedido(mismo, 1250)), []);
  // Otro cupón: el descuento no se sabe (null) y no se inventa una diferencia de total.
  const otro = contenidoPedido(alta({ lines: vacio1, aCuenta: false, paid: true, paymentMethod: "EFECTIVO", cupon: "OTRO" }), null);
  assert.equal(otro.total, null);
  assert.deepEqual(diferenciasConLoGrabado(contenidoGrabado(conCupon), otro), ["Cupón: se grabó el cupón VERANO10; ahora el cupón OTRO."]);
});

test("lo que se dice: la grabada con #N, total, cómo y cliente; anulada; pedido sin hablar de cobrar", () => {
  const g: VentaYaGrabada = {
    id: "o1",
    code: 42,
    esPedido: false,
    total: 15500,
    como: "a cuenta",
    cliente: "María Pérez",
    telefono: "11 4000 0000",
    anulada: false,
    diferencias: ["Cliente: se grabó María Pérez (11 4000 0000); ahora Juan Gómez (11 5000 0000)."],
  };
  assert.equal(tituloDeYaGrabada(g), "La venta #42 ya se había grabado con $15.500,00 (a cuenta, María Pérez).");
  assert.equal(
    detalleDeYaGrabada(g),
    "Lo que cambiaste (Cliente: se grabó María Pérez (11 4000 0000); ahora Juan Gómez (11 5000 0000)) no se registró.",
  );
  assert.equal(textoDeYaGrabada(g), `${tituloDeYaGrabada(g)} ${detalleDeYaGrabada(g)}`);
  const anulada = { ...g, anulada: true, diferencias: [], como: "cobrada en Efectivo", cliente: null };
  assert.equal(tituloDeYaGrabada(anulada), "La venta #42 ya se había grabado con $15.500,00 (cobrada en Efectivo) y después se anuló.");
  assert.equal(detalleDeYaGrabada(anulada), "No se volvió a cobrar.");
  const pedido = { ...g, esPedido: true, como: "sin cobrar" };
  assert.match(tituloDeYaGrabada(pedido), /^El pedido #42 ya se había registrado con/);
  assert.equal(detalleDeYaGrabada({ ...pedido, diferencias: [] }), "No se registró otro pedido.");
  assert.doesNotMatch(textoDeYaGrabada({ ...pedido, diferencias: [] }), /no se (volvió a )?cobr/);
  // El reintento igual: el pedido no habla de cobrar; la venta sin cobrar tampoco.
  assert.equal(mensajeDeYaGrabadaIgual({ code: 7, esPedido: true, cobrada: false }), "Ese pedido ya estaba registrado (#7): no se registró dos veces.");
  assert.equal(mensajeDeYaGrabadaIgual({ code: 7, esPedido: false, cobrada: true }), "Esa venta ya estaba registrada (#7): no se cobró dos veces.");
  assert.equal(mensajeDeYaGrabadaIgual({ code: 7, esPedido: false, cobrada: false }), "Esa venta ya estaba registrada (#7): no se registró dos veces.");
});

test("'no se cobró' SÓLO ante un rechazo de negocio; todo lo demás es 'no sabemos'", () => {
  // Rechazos que prueban que no se grabó nada (antes de escribir o dentro de la tx que se deshace).
  assert.equal(motivoDelRechazoDelAlta(new RechazoDeDominio("Para envío a domicilio hace falta la dirección.")), "Para envío a domicilio hace falta la dirección.");
  assert.equal(motivoDelRechazoDelAlta(new CuponRechazado("El cupón X ya se usó todas las veces que permitía.")), "El cupón X ya se usó todas las veces que permitía.");
  assert.equal(motivoDelRechazoDelAlta(new PrecioAManoRechazado("Hasta $50.000 sin producto.")), "Hasta $50.000 sin producto.");
  assert.equal(motivoDelRechazoDelAlta(new RechazoDelStock('Sin stock suficiente de "Vacío" para descontar 2.')), 'Sin stock suficiente de "Vacío" para descontar 2.');
  // Lo que NO prueba nada: Prisma (incluida la tx que falla al confirmar), el driver, un Error suelto.
  const conocido = new Prisma.PrismaClientKnownRequestError("Transaction already closed: could not commit", { code: "P2028", clientVersion: "7" });
  const desconocido = new Prisma.PrismaClientUnknownRequestError("Server has closed the connection.", { clientVersion: "7" });
  const inicio = new Prisma.PrismaClientInitializationError("Can't reach database server", "7");
  for (const e of [conocido, desconocido, inicio, new Error("Connection terminated unexpectedly"), new TypeError("x is undefined"), "texto", null]) {
    assert.equal(motivoDelRechazoDelAlta(e), null, String(e));
  }
  // La tienda sigue viendo como rechazo los mismos que antes (Error pelado) y los nuevos.
  assert.equal(esRechazoDelAlta(new RechazoDeDominio("Agregá al menos un producto con cantidad al pedido.")), true);
  assert.equal(esRechazoDelAlta(new RechazoDelStock("Sin stock suficiente.")), true);
  assert.equal(esRechazoDelAlta(new Error("texto")), true);
  assert.equal(esRechazoDelAlta(conocido), false);
});
