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
  compararConLoGrabado,
  pedidoDelReintento,
  mensajeDeYaGrabadaIgual,
  textoDeYaGrabada,
  textoDelFaltante,
  tituloDeYaGrabada,
  detalleDeYaGrabada,
  type VentaGrabadaLeida,
  type VentaYaGrabada,
} from "./reintento-de-venta";
import { CuponRechazado, PrecioAManoRechazado, clienteDelTelefono, motivoDelRechazoDelAlta, esRechazoDelAlta } from "./order-core";
import { RechazoDeDominio } from "./rechazo-de-dominio";
import { RechazoDelStock } from "./stock/ledger";
import { pedidoDelFormulario } from "./respuesta-al-reintento";
import { readFileSync } from "node:fs";

// La venta de María, a cuenta: Vacío 1,240 kg a $12.500/kg = $15.500. El nombre de la ficha
// ("María Pérez") lo puso la base: el reintento no lo manda ni se compara.
const vacio = (quantity: number, unitPrice = 12500) => ({ productId: "p_vacio", name: "Vacío", saleUnit: "WEIGHT", quantity, unitPrice, lineTotal: Math.round(quantity * unitPrice * 100) / 100 });
const grabadaMaria: VentaGrabadaLeida = {
  channel: "COUNTER",
  fulfillment: "PICKUP",
  customerName: "María Pérez",
  customerPhone: "11 4000 0000",
  address: null,
  scheduledFor: null,
  notes: null,
  discount: 0,
  total: 15500,
  paid: true,
  paymentMethod: null,
  items: [vacio(1.24)],
  cupon: null,
};

type Envio = Parameters<typeof pedidoDelReintento>[0];
type Opciones = NonNullable<Parameters<typeof pedidoDelReintento>[1]>;
/** Lo que manda la pantalla: por defecto, la misma venta de María a cuenta. */
function envio(p: Partial<Envio> = {}, o: Opciones = { aCuenta: { createdBy: "user:u1" } }) {
  return pedidoDelReintento(
    {
      channel: "COUNTER",
      fulfillment: "PICKUP",
      customerPhone: "11 4000 0000",
      address: null,
      notes: null,
      scheduledFor: null,
      paid: false,
      paymentMethod: null,
      items: [{ productId: "p_vacio", qty: 1.24 }],
      ...p,
    },
    o,
  );
}
const efectivo: Opciones = {};
const textos = (c: ReturnType<typeof compararConLoGrabado>) => c.diferencias.map((d) => d.texto);

test("el mismo reintento: sin diferencias, aunque cambió el precio de catálogo o la ficha (el refutador S1/S2)", () => {
  // El teléfono escrito de otra forma.
  assert.deepEqual(compararConLoGrabado(grabadaMaria, envio({ customerPhone: "1140000000" })), { diferencias: [], faltante: null });
  // S1: la dueña subió el Vacío a $13.000/kg después del corte. Lo pedido no trae precios: el
  // reintento no re-cotiza. Se compara contra lo grabado a $12.500 y es lo mismo.
  const aDoce = { ...grabadaMaria, paymentMethod: "EFECTIVO", items: [vacio(1, 12500)], total: 12500 };
  assert.deepEqual(textos(compararConLoGrabado(aDoce, envio({ paid: true, paymentMethod: "EFECTIVO", items: [{ productId: "p_vacio", qty: 1 }] }, efectivo))), []);
  // S2: al grabar no había ficha; después se creó. Ni la ficha ni su nombre se comparan.
  const sinFicha = { ...aDoce, customerName: "Mostrador" };
  assert.deepEqual(textos(compararConLoGrabado(sinFicha, envio({ paid: true, paymentMethod: "EFECTIVO", items: [{ productId: "p_vacio", qty: 1 }] }, efectivo))), []);
});

test("R1 — a cuenta: otro TELÉFONO es otra deuda: se dice y no hay 'lo que falta'", () => {
  const c = compararConLoGrabado(grabadaMaria, envio({ customerPhone: "11 5000 0000" }));
  assert.deepEqual(textos(c), ["Teléfono del cliente: se grabó 11 4000 0000; ahora 11 5000 0000."]);
  assert.equal(c.faltante, null);
  // A cuenta → efectivo.
  const m = compararConLoGrabado(grabadaMaria, envio({ paid: true, paymentMethod: "EFECTIVO" }, efectivo));
  assert.deepEqual(textos(m), ["Cómo pagó: se grabó a cuenta; ahora en Efectivo."]);
  assert.equal(m.faltante, null);
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
  total: 25000,
  paid: false,
  items: [vacio(2)],
};
const pedidoDe = (p: Partial<Envio>) =>
  envio({ channel: "ONLINE", fulfillment: "DELIVERY", address: "Av. Mitre 1234", scheduledFor: new Date(sabado), notes: "en milanesas", items: [{ productId: "p_vacio", qty: 2 }], ...p }, efectivo);

test("R2 — pedido: entrega, dirección, horario y nota cambiados → una frase por cosa, ninguna 'de más'", () => {
  assert.deepEqual(textos(compararConLoGrabado(pedidoGrabado, pedidoDe({ address: " Av.  Mitre 1234 " }))), [], "espacios de más no son otra dirección");
  const c = compararConLoGrabado(pedidoGrabado, pedidoDe({ fulfillment: "PICKUP", address: null, scheduledFor: null, notes: null }));
  assert.deepEqual(textos(c), [
    "Entrega: se grabó «envío a domicilio»; ahora «retira en el local».",
    "Dirección: se grabó «Av. Mitre 1234»; ahora sin dirección.",
    "Horario: se grabó 26/09/2026 10:00; ahora sin horario.",
    "Nota: se grabó «en milanesas»; ahora sin nota.",
  ]);
  assert.equal(c.faltante, null);
  // Venta ↔ pedido: otro canal.
  assert.deepEqual(textos(compararConLoGrabado(pedidoGrabado, envio({ items: [{ productId: "p_vacio", qty: 2 }] }, efectivo))), [
    "Se grabó como un pedido; ahora es una venta de mostrador.",
  ]);
});

test("lo que falta: SÓLO si todo lo distinto es de más (más peso, un corte nuevo, un precio a mano nuevo)", () => {
  const catalogo = new Map([["p_entrana", { nombre: "Entraña", porPeso: true }]]);
  const enEfectivo: VentaGrabadaLeida = { ...grabadaMaria, paymentMethod: "EFECTIVO", items: [vacio(1.24), { productId: null, name: "Bolsa", saleUnit: "UNIT", quantity: 1, unitPrice: 500, lineTotal: 500 }], total: 16000 };
  const base = { paid: true, paymentMethod: "EFECTIVO" as const, lineasAMano: [{ nombre: "bolsa ", importe: 500 }] };
  // Más peso de Vacío, Entraña nueva y otra bolsa: todo de más → lo que falta es exactamente eso.
  const c = compararConLoGrabado(
    enEfectivo,
    envio({ ...base, items: [{ productId: "p_vacio", qty: 1 }, { productId: "p_vacio", qty: 0.5 }, { productId: "p_entrana", qty: 0.95 }], lineasAMano: [{ nombre: "Bolsa", importe: 500 }, { nombre: "Bolsa", importe: 500 }] }, efectivo),
    catalogo,
  );
  assert.deepEqual(textos(c), [
    "Vacío: se grabó 1,24 kg; ahora 1,5 kg.",
    "Entraña 0,95 kg: no está en la grabada.",
    "Bolsa (precio a mano $500,00): no está en la grabada.",
  ]);
  assert.deepEqual(c.faltante, {
    productos: [
      { productId: "p_vacio", nombre: "Vacío", porPeso: true, cantidad: 0.26 },
      { productId: "p_entrana", nombre: "Entraña", porPeso: true, cantidad: 0.95 },
    ],
    aMano: [{ nombre: "Bolsa", importe: 500 }],
  });
  assert.equal(textoDelFaltante(c.faltante!), "Vacío 0,26 kg, Entraña 0,95 kg, Bolsa $500,00");
  // Lo mismo, pero además cambió el medio: no se "completa" con otra venta.
  const conMedio = compararConLoGrabado(enEfectivo, envio({ ...base, paymentMethod: "MERCADOPAGO", items: [{ productId: "p_vacio", qty: 1.24 }, { productId: "p_entrana", qty: 0.95 }] }, efectivo), catalogo);
  assert.equal(conMedio.faltante, null);
  // Se sacó algo, o menos peso: no es de más.
  assert.equal(compararConLoGrabado(enEfectivo, envio({ ...base, items: [{ productId: "p_vacio", qty: 1 }] }, efectivo)).faltante, null);
  assert.deepEqual(textos(compararConLoGrabado(enEfectivo, envio({ ...base, lineasAMano: [] , items: [{ productId: "p_vacio", qty: 1.24 }] }, efectivo))), [
    "Bolsa (precio a mano $500,00): se grabó; ahora no está.",
  ]);
  // El precio a mano con otro importe: se sacó uno y se puso otro → no es de más.
  const otroImporte = compararConLoGrabado(enEfectivo, envio({ ...base, lineasAMano: [{ nombre: "Bolsa", importe: 700 }] }, efectivo));
  assert.equal(otroImporte.faltante, null);
  assert.equal(otroImporte.diferencias.length, 2);
});

test("R4 — descuentos: el cupón por su código; el 10 % a mano sobre lo grabado; con descuento no hay 'lo que falta'", () => {
  const conCupon: VentaGrabadaLeida = { ...grabadaMaria, paymentMethod: "EFECTIVO", discount: 1250, total: 11250, cupon: "VERANO10", items: [vacio(1)] };
  const uno = { paid: true, paymentMethod: "EFECTIVO" as const, items: [{ productId: "p_vacio", qty: 1 }] };
  // El cupón cambiado por un 10 % a mano del MISMO monto: no es la misma venta (el cupón gastó un uso).
  assert.deepEqual(textos(compararConLoGrabado(conCupon, envio(uno, { descuento: { pedido: { tipo: "porcentaje", valor: 10 } } }))), [
    "Cupón: se grabó el cupón VERANO10; ahora sin cupón.",
  ]);
  // El mismo cupón (escrito en minúsculas): igual, sin mirar cuánto descontaría hoy.
  assert.deepEqual(textos(compararConLoGrabado(conCupon, envio(uno, { cupon: " verano10" }))), []);
  // Un 10 % a mano: se calcula sobre lo GRABADO ($12.500) y da los mismos $1.250.
  const aMano: VentaGrabadaLeida = { ...conCupon, cupon: null };
  assert.deepEqual(textos(compararConLoGrabado(aMano, envio(uno, { descuento: { pedido: { tipo: "porcentaje", valor: 10 } } }))), []);
  assert.deepEqual(textos(compararConLoGrabado(aMano, envio(uno, { descuento: { pedido: { tipo: "monto", valor: 1250 } } }))), []);
  assert.deepEqual(textos(compararConLoGrabado(aMano, envio(uno, efectivo))), ["Descuento: se grabó −$1.250,00; ahora −$0,00."]);
  // Con descuento, un corte de más no se cobra aparte.
  const mas = compararConLoGrabado(aMano, envio({ ...uno, items: [{ productId: "p_vacio", qty: 2 }] }, { descuento: { pedido: { tipo: "porcentaje", valor: 10 } } }));
  assert.equal(mas.faltante, null);
  assert.match(textos(mas).at(-1) ?? "", /^Descuento: la venta tiene descuento y cambiaron las líneas/);
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
    diferencias: ["Teléfono del cliente: se grabó 11 4000 0000; ahora 11 5000 0000."],
    faltante: null,
  };
  assert.equal(tituloDeYaGrabada(g), "La venta #42 ya se había grabado con $15.500,00 (a cuenta, María Pérez).");
  assert.equal(
    detalleDeYaGrabada(g),
    "Lo que cambiaste (Teléfono del cliente: se grabó 11 4000 0000; ahora 11 5000 0000) no se registró.",
  );
  assert.equal(textoDeYaGrabada(g), `${tituloDeYaGrabada(g)} ${detalleDeYaGrabada(g)}`);
  const anulada = { ...g, anulada: true, diferencias: [], como: "cobrada en Efectivo", cliente: null };
  assert.equal(tituloDeYaGrabada(anulada), "La venta #42 ya se había grabado con $15.500,00 (cobrada en Efectivo) y después se anuló.");
  assert.equal(detalleDeYaGrabada(anulada), "No se volvió a cobrar.");
  const pedido = { ...g, esPedido: true, como: "sin cobrar" };
  assert.match(tituloDeYaGrabada(pedido), /^El pedido #42 ya se había registrado con/);
  assert.equal(detalleDeYaGrabada({ ...pedido, diferencias: [] }), "No se registró otro pedido.");
  assert.doesNotMatch(textoDeYaGrabada({ ...pedido, diferencias: [] }), /no se (volvió a )?cobr/);
  // Todo lo distinto es de más: se dice qué se agregó.
  const conFaltante = { ...g, diferencias: ["Entraña 0,95 kg: no está en la grabada."], faltante: { productos: [{ productId: "p_e", nombre: "Entraña", porPeso: true, cantidad: 0.95 }], aMano: [] } };
  assert.equal(detalleDeYaGrabada(conFaltante), "Lo que agregaste (Entraña 0,95 kg) no se registró.");
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

test("lo que manda Vender, leído del formulario como en createOrder, es la misma venta que la grabada", () => {
  const fd = new FormData();
  fd.set("channel", "COUNTER");
  fd.append("productId", "p_vacio");
  fd.append("quantity", "1,24");
  fd.set("aCuenta", "1");
  fd.set("customerPhone", "11 4000-0000");
  fd.set("customerName", "Otro nombre cualquiera");
  const pedido = pedidoDelFormulario(fd, { channel: "COUNTER", fulfillment: "PICKUP", scheduledRaw: "", aCuenta: true });
  assert.deepEqual(pedido, envio({ customerPhone: "11 4000-0000" }));
  assert.deepEqual(compararConLoGrabado(grabadaMaria, pedido), { diferencias: [], faltante: null });
  // Con medio: el crudo sólo se compara (el que se graba lo decide medioDeCobroRequerido).
  const cobrada = new FormData();
  cobrada.append("productId", "p_vacio");
  cobrada.append("quantity", "1");
  cobrada.set("paid", "on");
  cobrada.set("paymentMethod", "EFECTIVO");
  cobrada.set("descuentoTipo", "porcentaje");
  cobrada.set("descuentoValor", "10");
  const p2 = pedidoDelFormulario(cobrada, { channel: "COUNTER", fulfillment: "PICKUP", scheduledRaw: "", aCuenta: false });
  assert.deepEqual(p2.cobro, { tipo: "medio", medio: "EFECTIVO" });
  assert.deepEqual(p2.descuento, { tipo: "porcentaje", valor: 10 });
  assert.deepEqual(p2.productos, [{ productId: "p_vacio", cantidad: 1 }]);
});

// TRINQUETE: la clave se busca ANTES de validar o re-cotizar nada, en la action y en el alta.
// Si alguien mueve una validación arriba de la búsqueda, el reintento idéntico de una venta ya
// grabada vuelve a decir "no se cobró" (refutador S3).
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
function cuerpo(src: string, firma: string): string {
  const i = src.indexOf(firma);
  assert.ok(i >= 0, `no encontré «${firma}»`);
  return src.slice(i, src.indexOf("\n}\n", i));
}
test("TRINQUETE: createOrder e insertOrder buscan la clave antes de toda validación", () => {
  const acciones = cuerpo(sinComentarios(readFileSync(new URL("./order-actions.ts", import.meta.url), "utf8")), "export async function createOrder(");
  const busca = acciones.indexOf("pedidoConClave(");
  assert.ok(busca > 0, "createOrder no busca la clave");
  for (const despues of ["cuentasCorrientesEnabled(", "requireAppAccion(", "medioDeCobroRequerido(", "lastClosedDay(", "insertOrder("]) {
    const i = acciones.indexOf(despues);
    assert.ok(i > busca, `«${despues}» corre antes de buscar la clave`);
  }
  const alta = cuerpo(sinComentarios(readFileSync(new URL("./order-core.ts", import.meta.url), "utf8")), "export async function insertOrder(");
  const buscaAlta = alta.indexOf("findOrderByIdempotencyKey(");
  assert.ok(buscaAlta > 0, "insertOrder no busca la clave");
  for (const despues of ["throw new RechazoDeDominio(", "decidirAlta(", "clienteDelTelefono(", "prisma.product.findMany("]) {
    const i = alta.indexOf(despues);
    assert.ok(i > buscaAlta, `«${despues}» corre antes de buscar la clave`);
  }
});

test("a cuenta: si la búsqueda de la ficha FALLA no se dice 'no tiene ficha' (sería 'no se cobró'): el error sube como 'no sabemos'", async () => {
  const falla = async () => {
    throw new Prisma.PrismaClientUnknownRequestError("Server has closed the connection.", { clientVersion: "7" });
  };
  // Venta común: la ficha es un extra; sin ella la venta sale igual (y queda en el log).
  assert.equal(await clienteDelTelefono("t1", "11 4000 0000", { buscar: falla }), null);
  // A cuenta: el error no se traga, y no es un rechazo de negocio → createOrder contesta 'sin-confirmar'.
  let err: unknown = null;
  await clienteDelTelefono("t1", "11 4000 0000", { estricto: true, buscar: falla }).catch((e) => (err = e));
  assert.ok(err instanceof Prisma.PrismaClientUnknownRequestError);
  assert.equal(motivoDelRechazoDelAlta(err), null);
  assert.equal(await clienteDelTelefono("t1", "11 4000 0000", { estricto: true, buscar: async () => ({ id: "cli_1" }) }), "cli_1");
});
