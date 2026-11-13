// «Pedí Local»: la cuenta del dispositivo (mi-cuenta.ts), la piel de marca (marca.ts) y el renglón de
// pago del seguimiento (seguimiento.ts → pagoParaElCliente). Lógica pura, reloj fijo, sin DOM.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CUENTA_VACIA,
  TOPE_DIRECCIONES,
  TOPE_PEDIDOS,
  VENTANA_SEGUIMIENTO_MS,
  VIDA_SIN_CONFIRMAR_MS,
  asociarCodigo,
  asociarSeguimiento,
  claveDeLaCuenta,
  descartarSinConfirmar,
  guardarPedido,
  leerCuenta,
  olvidarDireccion,
  recordarDireccion,
  repetirBolsa,
  type CuentaLocal,
  type PedidoAGuardar,
} from "./mi-cuenta";
import { contraste, leerHex, pielDelLocal } from "./marca";
import { configDeliveryLocal } from "./config";
import { pagoParaElCliente } from "./seguimiento";

const T0 = new Date("2026-11-10T12:00:00.000Z");
const mas = (ms: number) => new Date(T0.getTime() + ms);
const pedido = (clave: string, extra: Partial<PedidoAGuardar> = {}): PedidoAGuardar => ({
  clave,
  items: [{ productId: "p1", nombre: "Cortado", cantidad: 2, saleUnit: "UNIT" }],
  total: 5000,
  fulfillment: "DELIVERY",
  ...extra,
});

// ── leerCuenta ──

test("leerCuenta: vacío, JSON roto, versión ajena u objeto raro → cuenta vacía, sin tirar", () => {
  for (const raw of [null, undefined, "", "{", "null", "[]", '{"v":99,"pedidos":[]}', '"texto"']) {
    assert.deepEqual(leerCuenta(raw), CUENTA_VACIA);
  }
});

test("leerCuenta: descarta entradas inválidas y conserva las buenas", () => {
  const c = guardarPedido(CUENTA_VACIA, pedido("k1"), T0);
  const sucio = JSON.parse(JSON.stringify(c));
  sucio.pedidos.push({ clave: "", fecha: "x", items: [] }, { clave: "k2", fecha: T0.toISOString(), items: [{ productId: "p", nombre: "X", cantidad: -1, saleUnit: "UNIT" }] });
  sucio.direcciones = [{ texto: "Calle 123", usada: T0.toISOString() }, { texto: 5 }, null];
  const l = leerCuenta(JSON.stringify(sucio));
  assert.equal(l.pedidos.length, 1);
  assert.equal(l.pedidos[0].clave, "k1");
  assert.deepEqual(l.direcciones, [{ texto: "Calle 123", usada: T0.toISOString() }]);
});

test("ida y vuelta: lo guardado se vuelve a leer igual", () => {
  let c = guardarPedido(CUENTA_VACIA, pedido("k1"), T0);
  c = recordarDireccion(c, "Ameghino 166, Monte Grande", T0);
  assert.deepEqual(leerCuenta(JSON.stringify(c)), c);
});

test("claveDeLaCuenta separa por negocio", () => {
  assert.notEqual(claveDeLaCuenta("bitacora"), claveDeLaCuenta("otro"));
});

// ── guardar, confirmar, descartar ──

test("guardarPedido: el más nuevo primero, reintento con la misma clave reemplaza sin perder el número", () => {
  let c = guardarPedido(CUENTA_VACIA, pedido("k1"), T0);
  c = asociarCodigo(c, "k1", "A12");
  c = guardarPedido(c, pedido("k2"), mas(1000));
  assert.deepEqual(c.pedidos.map((p) => p.clave), ["k2", "k1"]);
  c = guardarPedido(c, pedido("k1", { total: 7000 }), mas(2000));
  assert.deepEqual(c.pedidos.map((p) => p.clave), ["k1", "k2"]);
  assert.equal(c.pedidos[0].code, "A12");
  assert.equal(c.pedidos[0].total, 7000);
});

test("guardarPedido: sin clave o sin productos no guarda nada; respeta el tope", () => {
  assert.equal(guardarPedido(CUENTA_VACIA, pedido(""), T0), CUENTA_VACIA);
  assert.equal(guardarPedido(CUENTA_VACIA, pedido("k", { items: [] }), T0), CUENTA_VACIA);
  let c: CuentaLocal = CUENTA_VACIA;
  for (let i = 0; i < TOPE_PEDIDOS + 5; i++) c = asociarCodigo(guardarPedido(c, pedido(`k${i}`), mas(i * 1000)), `k${i}`, `C${i}`);
  assert.equal(c.pedidos.length, TOPE_PEDIDOS);
  assert.equal(c.pedidos[0].clave, `k${TOPE_PEDIDOS + 4}`);
});

test("los «sin confirmar» vencidos se olvidan; los confirmados quedan", () => {
  let c = guardarPedido(CUENTA_VACIA, pedido("viejo"), T0);
  c = asociarCodigo(guardarPedido(c, pedido("conNumero"), T0), "conNumero", "B7");
  c = guardarPedido(c, pedido("nuevo"), mas(VIDA_SIN_CONFIRMAR_MS + 1));
  assert.deepEqual(c.pedidos.map((p) => p.clave).sort(), ["conNumero", "nuevo"]);
});

test("descartarSinConfirmar: saca el rechazado sin número; no toca uno confirmado", () => {
  let c = guardarPedido(CUENTA_VACIA, pedido("k1"), T0);
  assert.equal(descartarSinConfirmar(c, "k1").pedidos.length, 0);
  c = asociarCodigo(c, "k1", "Z1");
  assert.equal(descartarSinConfirmar(c, "k1"), c);
});

// ── seguimiento ──

test("asociarSeguimiento: el último sin número dentro de la ventana recibe token, número y estado", () => {
  let c = guardarPedido(CUENTA_VACIA, pedido("k1"), T0);
  c = asociarSeguimiento(c, { token: "ord.firma", code: "45", estado: "Pedido recibido", terminado: false }, mas(5000));
  assert.equal(c.pedidos[0].token, "ord.firma");
  assert.equal(c.pedidos[0].code, "45");
  assert.equal(c.pedidos[0].estado, "Pedido recibido");
  // La segunda visita sólo actualiza el estado del mismo.
  c = asociarSeguimiento(c, { token: "ord.firma", code: "45", estado: "Entregado", terminado: true }, mas(VENTANA_SEGUIMIENTO_MS * 10));
  assert.equal(c.pedidos[0].estado, "Entregado");
  assert.equal(c.pedidos[0].terminado, true);
});

test("asociarSeguimiento: por número (pedido por WhatsApp) aunque esté fuera de la ventana", () => {
  let c = asociarCodigo(guardarPedido(CUENTA_VACIA, pedido("k1"), T0), "k1", "88");
  c = asociarSeguimiento(c, { token: "t88", code: "88", estado: "En camino", terminado: false }, mas(VENTANA_SEGUIMIENTO_MS * 3));
  assert.equal(c.pedidos[0].token, "t88");
});

test("asociarSeguimiento: un link ajeno (sin pedido que corresponda) no guarda nada", () => {
  const vacia = asociarSeguimiento(CUENTA_VACIA, { token: "x", code: "1", estado: "", terminado: false }, T0);
  assert.equal(vacia, CUENTA_VACIA);
  const c = guardarPedido(CUENTA_VACIA, pedido("k1"), T0);
  assert.equal(asociarSeguimiento(c, { token: "x", code: "1", estado: "", terminado: false }, mas(VENTANA_SEGUIMIENTO_MS + 1)), c);
  const confirmado = asociarCodigo(c, "k1", "2");
  assert.equal(asociarSeguimiento(confirmado, { token: "x", code: "1", estado: "", terminado: false }, mas(1000)), confirmado);
});

// ── direcciones ──

test("recordarDireccion: sin repetidas (tildes, mayúsculas, espacios), la última primero, con tope", () => {
  let c = recordarDireccion(CUENTA_VACIA, "Ameghino 166", T0);
  c = recordarDireccion(c, "  AMEGHINO   166 ", mas(1));
  assert.equal(c.direcciones.length, 1);
  assert.equal(c.direcciones[0].texto, "AMEGHINO 166");
  c = recordarDireccion(c, "abc", mas(2)); // muy corta: no se guarda
  assert.equal(c.direcciones.length, 1);
  for (let i = 0; i < TOPE_DIRECCIONES + 2; i++) c = recordarDireccion(c, `Calle ${i} número ${i}`, mas(10 + i));
  assert.equal(c.direcciones.length, TOPE_DIRECCIONES);
  assert.equal(c.direcciones[0].texto, `Calle ${TOPE_DIRECCIONES + 1} número ${TOPE_DIRECCIONES + 1}`);
  c = olvidarDireccion(c, c.direcciones[0].texto);
  assert.equal(c.direcciones.length, TOPE_DIRECCIONES - 1);
});

// ── repetir ──

test("repetirBolsa: por id o por nombre; lo que no está, sin stock o cambió de unidad va a «faltan»", () => {
  const hoy = [
    { id: "p1", name: "Cortado", saleUnit: "UNIT" as const },
    { id: "p9", name: "Medialuna", saleUnit: "UNIT" as const },
    { id: "p3", name: "Budín", saleUnit: "UNIT" as const, disponibilidad: "sin-stock" },
    { id: "p4", name: "Café en grano", saleUnit: "UNIT" as const },
  ];
  const r = repetirBolsa(
    [
      { productId: "p1", nombre: "Cortado", cantidad: 2, saleUnit: "UNIT" },
      { productId: "viejo", nombre: "medialuna", cantidad: 3, saleUnit: "UNIT" },
      { productId: "p3", nombre: "Budín", cantidad: 1, saleUnit: "UNIT" },
      { productId: "p4", nombre: "Café en grano", cantidad: 0.5, saleUnit: "WEIGHT" },
      { productId: "nada", nombre: "Tostado", cantidad: 1, saleUnit: "UNIT" },
    ],
    hoy,
  );
  assert.deepEqual(r.bolsa, { p1: 2, p9: 3 });
  assert.deepEqual(r.faltan, ["Budín", "Café en grano", "Tostado"]);
});

// ── marca ──

test("pielDelLocal: sin marca → piel GSG (sin variables)", () => {
  assert.deepEqual(pielDelLocal(undefined), { variables: {}, logoUrl: null, fotoPortada: null, banda: false, letra: null });
  assert.deepEqual(pielDelLocal({}), { variables: {}, logoUrl: null, fotoPortada: null, banda: false, letra: null });
});

test("pielDelLocal: el texto sobre el primario siempre da AA; el primario como texto sólo si da 4,5:1", () => {
  for (const color of ["#1d4ed8", "#f5d142", "#7a3e1d", "#ffffff", "#000", "#c08a3e"]) {
    const v = pielDelLocal({ colorPrimario: color }).variables;
    const sobre = leerHex(v["--pl-sobre-primario"])!;
    assert.ok(contraste(leerHex(color)!, sobre) >= 4.5, `${color} con ${v["--pl-sobre-primario"]}`);
    if (v["--pl-primario-texto"]) assert.ok(contraste(leerHex(color)!, [250, 248, 244]) >= 4.5);
  }
  assert.equal(pielDelLocal({ colorPrimario: "#f5d142" }).variables["--pl-primario-texto"], undefined);
  assert.equal(pielDelLocal({ colorPrimario: "#7a3e1d" }).variables["--pl-primario-texto"], "#7a3e1d");
});

test("pielDelLocal: fondo oscuro o color inválido se ignoran; URL sólo propia o https", () => {
  const p = pielDelLocal({ colorFondo: "#111111", colorPrimario: "rojo", logoUrl: "javascript:alert(1)", fotoPortada: "//evil.com/x.jpg" });
  assert.deepEqual(p, { variables: {}, logoUrl: null, fotoPortada: null, banda: false, letra: null });
  const q = pielDelLocal({ colorFondo: "#fffaf0", logoUrl: "/tenants/bitacora/logo.svg", fotoPortada: "https://cdn.example.com/a.jpg" });
  assert.equal(q.variables["--pl-fondo"], "#fffaf0");
  assert.equal(q.logoUrl, "/tenants/bitacora/logo.svg");
  assert.equal(q.fotoPortada, "https://cdn.example.com/a.jpg");
  assert.equal(pielDelLocal({ logoUrl: 'https://x.com/a.png") ; background:url(' }).logoUrl, null);
});

test("pielDelLocal: banda y acento con texto encima ≥ 4,5:1; letra sólo de la lista", () => {
  const v = pielDelLocal({ colorFondo: "#FCF5F0", colorPrimario: "#323977", colorBanda: "#323977", colorAcento: "#B37C57", letra: "manrope" });
  assert.equal(v.banda, true);
  assert.equal(v.letra, "manrope");
  const rgb = (k: string) => leerHex(v.variables[k])!;
  assert.equal(v.variables["--pl-sobre-banda"], "#fcf5f0", "sobre el azul, la crema del local");
  assert.ok(contraste(rgb("--pl-banda"), rgb("--pl-sobre-banda")) >= 4.5);
  assert.ok(contraste(rgb("--pl-banda"), rgb("--pl-sobre-banda-suave")) >= 4.5);
  assert.notEqual(v.variables["--pl-sobre-banda-suave"], v.variables["--pl-sobre-banda"]);
  // Terracota: relleno con tinta (el blanco da 3,54 y no pasa); como texto, oscurecido hasta AA.
  assert.equal(v.variables["--pl-acento"], "#b37c57");
  assert.ok(contraste(rgb("--pl-acento"), rgb("--pl-sobre-acento")) >= 4.5);
  assert.notEqual(v.variables["--pl-sobre-acento"], "#ffffff");
  for (const fondo of ["#fcf5f0", "#ffffff"]) assert.ok(contraste(rgb("--pl-acento-texto"), leerHex(fondo)!) >= 4.5, fondo);
  assert.notEqual(v.variables["--pl-acento-texto"], "#b37c57");
  // Una banda gris media (ningún texto llega a 4,5:1) no se pinta; una letra desconocida, tampoco.
  const gris = pielDelLocal({ colorBanda: "#767676", letra: "comic-sans" as never });
  assert.equal(gris.variables["--pl-banda"] === undefined || contraste(leerHex(gris.variables["--pl-banda"])!, leerHex(gris.variables["--pl-sobre-banda"])!) >= 4.5, true);
  assert.equal(gris.letra, null);
  assert.equal(pielDelLocal({ colorBanda: "azul" }).banda, false);
});

test("pielDelLocal de Bitácora (config.ts): banda azul, fondo crema, Manrope, logo y portada https", () => {
  const p = pielDelLocal(configDeliveryLocal("bitacora")!.marca);
  assert.equal(p.variables["--pl-primario"], "#323977");
  assert.equal(p.variables["--pl-fondo"], "#fcf5f0");
  assert.equal(p.banda, true);
  assert.equal(p.letra, "manrope");
  assert.match(p.logoUrl ?? "", /^https:\/\//);
  assert.match(p.fotoPortada ?? "", /^https:\/\//);
});

// ── pago en el seguimiento ──

test("pagoParaElCliente: efectivo con cuánto y vuelto; justo; transferencia; MP; pagado o cancelado no", () => {
  const base = { pagaCon: null, total: 16500, paid: false, cancelado: false, transferenciaVisible: false };
  assert.deepEqual(pagoParaElCliente({ ...base, medio: "efectivo", pagaCon: 20000 }), { titulo: "Pagás en efectivo", detalle: "Con $20.000: tu vuelto es $3.500." });
  assert.deepEqual(pagoParaElCliente({ ...base, medio: "efectivo", pagaCon: 16500 }), { titulo: "Pagás en efectivo", detalle: "Con $16.500, justo." });
  assert.deepEqual(pagoParaElCliente({ ...base, medio: "efectivo" }), { titulo: "Pagás en efectivo", detalle: "Justo, sin vuelto." });
  assert.match(pagoParaElCliente({ ...base, medio: "transferencia" })!.detalle, /alias por WhatsApp/);
  assert.match(pagoParaElCliente({ ...base, medio: "transferencia", transferenciaVisible: true })!.detalle, /acá abajo/);
  assert.match(pagoParaElCliente({ ...base, medio: "mercadopago" })!.titulo, /Mercado Pago/);
  assert.equal(pagoParaElCliente({ ...base, medio: "efectivo", paid: true }), null);
  assert.equal(pagoParaElCliente({ ...base, medio: "efectivo", cancelado: true }), null);
  assert.equal(pagoParaElCliente({ ...base, medio: null }), null);
});
