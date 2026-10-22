// EL REPARTO DEL CADETE, sin base (Magra, tanda 2 · 2C): zona y franja de cada envío, el orden por
// zona (MG-055), la hoja y el texto del cadete, las marcas (la última manda) y la suma de la
// rendición por medio (MG-056).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cobroDelEnvio,
  envioDelReparto,
  estadoDelReparto,
  estaEnReparto,
  franjaDelPedido,
  franjaPropuesta,
  franjasDelDia,
  hojaDelReparto,
  hojaImprimible,
  idDeReparto,
  leerMarcaDeReparto,
  notaDeLaClienta,
  ordenarReparto,
  resumenDeLaRendicion,
  textoDelResumen,
  textoParaElCadete,
  waDelCadete,
  zonaDelPedido,
  type EnvioLeido,
  type MarcaDeReparto,
} from "./reparto-core";

// 22/10/2026 17:00 en Buenos Aires (UTC-3) = 20:00 UTC: el comienzo de la franja 17–19 que guarda la tienda.
const H17 = "2026-10-22T20:00:00.000Z";
const H11 = "2026-10-22T14:00:00.000Z";
const MANIANA_17 = "2026-10-23T20:00:00.000Z";
const ZONAS = ["Canning – barrios cerrados", "Canning centro", "Ezeiza / Monte Grande"];

function envio(o: Partial<EnvioLeido> & { code: number }): EnvioLeido {
  return {
    id: `o${o.code}`,
    cliente: "Ana UAT",
    telefono: "11 5555-1234",
    direccion: "Los Álamos 123",
    notas: "Zona: Canning centro · Franja: L-S 17-19 (hoy 22/10)",
    horario: H17,
    status: "READY",
    cobrado: false,
    total: 10000,
    lineas: [{ productId: "p1", nombre: "Vacío", unidad: "WEIGHT", cantidad: 0.5 }],
    ...o,
  };
}

test("la zona sale de la nota de la tienda o del renglón del envío del mostrador; sin ninguna, null", () => {
  assert.equal(zonaDelPedido({ notas: "Zona: Canning – barrios cerrados · Franja: L-S 17-19 (hoy 22/10) · timbre 2", lineas: [] }), "Canning – barrios cerrados");
  assert.equal(
    zonaDelPedido({ notas: "dejar en portería", lineas: [{ productId: null, nombre: "Envío · Ezeiza / Monte Grande" }, { productId: "p", nombre: "Envío · trampa" }] }),
    "Ezeiza / Monte Grande",
  );
  assert.equal(zonaDelPedido({ notas: null, lineas: [{ productId: null, nombre: "Envío a domicilio" }] }), null, "el envío de siempre no tiene zona");
  assert.equal(zonaDelPedido({ notas: null, lineas: [] }), null);
  assert.equal(notaDeLaClienta("Zona: Canning centro · Franja: L-S 17-19 (hoy 22/10) · timbre 2"), "timbre 2");
  assert.equal(notaDeLaClienta("Zona: Canning centro"), null);
});

test("la franja: de la nota de la tienda (17–19 h) o sólo la hora del mostrador; sin horario, aparte", () => {
  const t = franjaDelPedido({ notas: "Zona: X · Franja: L-S 17-19 (hoy 22/10)", horario: H17 });
  assert.deepEqual([t.dia, t.desde, t.hasta, t.texto], ["2026-10-22", "17:00", "19:00", "17–19 h"]);
  const m = franjaDelPedido({ notas: null, horario: "2026-10-22T13:30:00.000Z" });
  assert.deepEqual([m.dia, m.desde, m.hasta, m.texto], ["2026-10-22", "10:30", null, "desde 10:30"]);
  const s = franjaDelPedido({ notas: null, horario: null });
  assert.deepEqual([s.dia, s.texto], [null, "Sin horario"]);
  assert.notEqual(t.clave, franjaDelPedido({ notas: "Franja: L-S 17-19 (mañana 23/10)", horario: MANIANA_17 }).clave, "otro día, otra franja");
});

test("MG-055 · seis envíos de la franja 17–19: la hoja ordenada por zona (el recorrido del dueño), con dirección, total y cobrar / ya pagó", () => {
  const leidos = [
    envio({ code: 131, cliente: "Bruno", notas: "Zona: Ezeiza / Monte Grande · Franja: L-S 17-19 (hoy 22/10)", direccion: "Ruta 52 km 3", total: 18000 }),
    envio({ code: 128, cliente: "Ana", notas: "Zona: Canning – barrios cerrados · Franja: L-S 17-19 (hoy 22/10)", direccion: "Los Álamos 123", total: 25700 }),
    envio({ code: 129, cliente: "Carla", direccion: "Mitre 900", total: 20000 }),
    envio({ code: 130, cliente: "Dora", notas: "Zona: Canning – barrios cerrados · Franja: L-S 17-19 (hoy 22/10)", direccion: "El Ombú 45", cobrado: true, total: 15000 }),
    envio({ code: 132, cliente: "Ema", direccion: "Belgrano 12", total: 9000 }),
    envio({ code: 133, cliente: "Fede", notas: "Zona: Barrio que ya no está · Franja: L-S 17-19 (hoy 22/10)", direccion: "Calle 1", total: 7000 }),
    // Otra franja y otro estado: no entran a la hoja de 17–19.
    envio({ code: 140, notas: "Zona: Canning centro · Franja: L-S 11-13 (hoy 22/10)", horario: H11 }),
    envio({ code: 141, status: "PREPARING", direccion: "Sarmiento 3" }),
  ];
  const envios = leidos.map((e) => envioDelReparto(e, undefined));
  const franjas = franjasDelDia(envios, "2026-10-22");
  assert.deepEqual(
    franjas.map((f) => [f.texto, f.envios, f.listos, f.aSalir]),
    [
      ["11–13 h", 1, 1, 1],
      ["17–19 h", 7, 6, 6],
    ],
  );
  const f17 = franjas.find((f) => f.texto === "17–19 h")!;
  const hoja = hojaDelReparto(
    envios.filter((e) => e.franja.clave === f17.clave),
    ZONAS,
  );
  assert.equal(hoja.envios, 6);
  assert.deepEqual(
    hoja.grupos.map((g) => [g.zona, g.envios.map((e) => e.code)]),
    [
      ["Canning – barrios cerrados", [130, 128]], // por dirección: El Ombú antes que Los Álamos
      ["Canning centro", [132, 129]], // Belgrano antes que Mitre
      ["Ezeiza / Monte Grande", [131]],
      ["Barrio que ya no está", [133]], // las zonas que no están en Envíos, después
    ],
  );
  assert.equal(hoja.aCobrar, 25700 + 20000 + 9000 + 18000 + 7000, "lo que ya pagó no se cobra en la calle");
  assert.equal(hoja.grupos[0].aCobrar, 25700);
  assert.deepEqual(hoja.sinTerminar.map((e) => e.code), [141], "el que se está armando no sale: se avisa aparte");
  assert.equal(cobroDelEnvio(hoja.grupos[0].envios[0]), "Ya pagó");
  assert.equal(cobroDelEnvio(hoja.grupos[0].envios[1]), "Cobrar $25.700");

  const texto = textoParaElCadete(hoja, { negocio: "Magra", dia: "mié 22/10", franja: "17–19 h" });
  assert.match(texto, /^\*Reparto 17–19 h · mié 22\/10\* \(Magra\)\n6 envíos · cobrar en total \$79\.700/);
  assert.ok(texto.indexOf("CANNING – BARRIOS CERRADOS") < texto.indexOf("CANNING CENTRO"));
  assert.match(texto, /2\. #128 Ana · 11 5555-1234\n {3}Los Álamos 123\n {3}0,5 kg Vacío\n {3}Cobrar \$25\.700/);
  assert.match(texto, /1\. #130 Dora[^\n]*\n[^\n]*\n[^\n]*\n {3}Ya pagó/);

  // Por WhatsApp: al cadete si hay número; si no, que WhatsApp pregunte a quién.
  assert.match(waDelCadete("11 4444-0000", "hola"), /^https:\/\/wa\.me\/5491144440000\?text=hola$/);
  assert.equal(waDelCadete("", "hola y chau"), "https://wa.me/?text=hola%20y%20chau");

  // Impresa: todo escapado (un nombre con < no rompe la hoja ni mete código).
  const html = hojaImprimible(
    { ...hoja, grupos: [{ ...hoja.grupos[0], envios: [{ ...hoja.grupos[0].envios[1], cliente: "<script>x</script>" }] }] },
    { negocio: "Magra", dia: "mié 22/10", franja: "17–19 h", cadete: "Juan" },
  );
  assert.ok(!html.includes("<script>x"), "escapado");
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /Cadete: Juan/);
  assert.match(html, /Cobrar \$25\.700/);
});

test("la franja propuesta es la primera con algo para salir", () => {
  const listos = [envioDelReparto(envio({ code: 1, notas: "Franja: L-S 11-13 (hoy 22/10)", horario: H11, status: "PREPARING" }), undefined), envioDelReparto(envio({ code: 2 }), undefined)];
  const franjas = franjasDelDia(listos, "2026-10-22");
  assert.equal(franjaPropuesta(franjas), franjas[1].clave);
  assert.equal(franjaPropuesta([]), null);
});

test("las marcas: la última manda; salió → en la calle sólo si sigue Listo; volvió → a Listos; lo forjado no se lee", () => {
  const t = (min: number) => new Date(Date.UTC(2026, 9, 22, 20, min));
  const salio = { tipo: "salio", reparto: "rep_1", franja: "17–19 h", cadete: "Juan" };
  const filas = [
    { entityId: "a", createdAt: t(5), changes: { tipo: "volvio", reparto: "rep_1", motivo: "No estaba" } },
    { entityId: "a", createdAt: t(0), changes: salio },
    { entityId: "b", createdAt: t(0), changes: salio },
    { entityId: "c", createdAt: t(0), changes: { tipo: "inventado", reparto: "rep_1" } },
    { entityId: null, createdAt: t(0), changes: salio },
  ];
  const e = estadoDelReparto(filas);
  assert.equal(e.get("a")?.marca.tipo, "volvio", "llegan desordenadas: se ordenan por fecha");
  assert.equal(e.get("b")?.marca.tipo, "salio");
  assert.equal(e.has("c"), false);
  assert.equal(estaEnReparto("READY", e.get("b")), true);
  assert.equal(estaEnReparto("DELIVERED", e.get("b")), false, "entregado: ya no está en la calle");
  assert.equal(estaEnReparto("READY", e.get("a")), false);
  assert.equal(leerMarcaDeReparto({ tipo: "salio" }), null, "sin salida no es una marca");
  const r = leerMarcaDeReparto({ tipo: "rendido", reparto: "r", resultado: "cobrado", code: 1, cliente: "A", total: 10, pagos: [{ medio: "EFECTIVO", monto: 10 }, { medio: "DOLARES", monto: 5 }, { medio: "EFECTIVO", monto: -3 }] });
  assert.deepEqual(r && r.tipo === "rendido" ? r.pagos : null, [{ medio: "EFECTIVO", monto: 10 }], "un medio inventado o un monto negativo no suma");
  assert.match(idDeReparto(new Date(0), 0.5), /^rep_0_[0-9a-z]{4}$/);

  const conSalida = envioDelReparto(envio({ code: 9 }), { marca: salio as MarcaDeReparto, cuando: t(5) });
  assert.deepEqual(conSalida.salida, { reparto: "rep_1", desde: "17:05", cadete: "Juan" });
});

test("MG-056 · rendición: Efectivo $20.000 + Efectivo $18.000 + MP $25.000 → efectivo $38.000 y MP $25.000; lo que quedó a cobrar aparte", () => {
  const rendido = (code: number, resultado: "cobrado" | "ya-pago" | "a-cobrar", total: number, pagos: { medio: "EFECTIVO" | "MERCADOPAGO" | "TRANSFERENCIA"; monto: number }[]) =>
    ({ tipo: "rendido", reparto: "rep_1", resultado, code, cliente: "X", total, pagos }) as const;
  const r = resumenDeLaRendicion([
    rendido(1, "cobrado", 20000, [{ medio: "EFECTIVO", monto: 20000 }]),
    rendido(2, "cobrado", 18000, [{ medio: "EFECTIVO", monto: 18000 }]),
    rendido(3, "cobrado", 25000, [{ medio: "MERCADOPAGO", monto: 25000 }]),
    rendido(4, "ya-pago", 15000, []),
    rendido(5, "a-cobrar", 9000.5, []),
  ]);
  assert.equal(r.efectivo, 38000);
  assert.deepEqual(r.porMedio.map((m) => [m.medio, m.monto]), [["EFECTIVO", 38000], ["MERCADOPAGO", 25000]]);
  assert.deepEqual([r.cobrados, r.yaPagos, r.aCobrar.cantidad, r.aCobrar.monto], [3, 1, 1, 9000.5]);
  assert.equal(textoDelResumen(r), "Efectivo $38.000 · Mercado Pago $25.000");
  assert.equal(textoDelResumen(resumenDeLaRendicion([])), "Nada cobrado todavía");
  // Pago dividido en la calle: cada medio a su columna, al centavo.
  const d = resumenDeLaRendicion([rendido(6, "cobrado", 30000.1, [{ medio: "EFECTIVO", monto: 10000.05 }, { medio: "TRANSFERENCIA", monto: 20000.05 }])]);
  assert.deepEqual(d.porMedio.map((m) => [m.medio, m.monto]), [["EFECTIVO", 10000.05], ["TRANSFERENCIA", 20000.05]]);
});

test("el orden del reparto no depende del orden de entrada y deja «Sin zona» al final", () => {
  const e = (code: number, zona: string | null, direccion: string) =>
    ({ code, zona, direccion, franja: { dia: null, desde: "17:00", hasta: null, clave: "", texto: "" } });
  const lista = [e(3, null, "A"), e(2, "Canning centro", "B"), e(1, "Canning – barrios cerrados", "C")];
  assert.deepEqual(ordenarReparto(lista, ZONAS).map((x) => x.code), [1, 2, 3]);
  assert.deepEqual(ordenarReparto([...lista].reverse(), ZONAS).map((x) => x.code), [1, 2, 3]);
});
