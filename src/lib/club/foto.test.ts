// La foto del club (BP-3): leer y validar el sobre, el `guardado` sin recorrer el estado, gzip de ida y vuelta, el
// día de caja de un instante y el resumen que se mira antes de restaurar (caja = cobrado al centavo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as M from "./motor.mjs";
import { comprimir, conGuardado, descomprimir, diaDeCajaEn, guardadoDelTexto, leerSobre, resumenDelRespaldo } from "./foto";

const RUTA_EJEMPLO = path.join(__dirname, "fixtures", "respaldo-ejemplo.json");
const ejemplo = () => readFileSync(RUTA_EJEMPLO, "utf8");

test("leerSobre: acepta el sobre v1 (texto u objeto) y rechaza en criollo lo que no es un respaldo", () => {
  const l = leerSobre(ejemplo());
  assert.ok(l.ok);
  assert.equal(l.sobre.v, 1);
  assert.equal(l.sobre.usuario, "u-3");
  assert.equal(l.sobre.guardado, Date.UTC(2026, 9, 18, 3, 40));
  assert.ok(leerSobre(JSON.parse(ejemplo())).ok);
  assert.match((leerSobre("no es json") as { motivo: string }).motivo, /no se pudo leer/);
  assert.match((leerSobre({ v: 2, estado: {} }) as { motivo: string }).motivo, /otra versión/);
  assert.match((leerSobre({ v: 1, estado: { config: {} } }) as { motivo: string }).motivo, /faltan datos/);
});

test("guardado: se agrega al final sin recorrer el estado, se reemplaza si ya estaba, y se lee aunque esté en otro lugar", () => {
  const base = JSON.stringify({ v: 1, estado: { a: 1 }, secuencia: 3 });
  const con = conGuardado(base, 1760000000123);
  assert.equal(con, '{"v":1,"estado":{"a":1},"secuencia":3,"guardado":1760000000123}');
  assert.deepEqual(JSON.parse(con), { v: 1, estado: { a: 1 }, secuencia: 3, guardado: 1760000000123 });
  assert.equal(conGuardado(con, 5), '{"v":1,"estado":{"a":1},"secuencia":3,"guardado":5}', "no duplica la clave");
  assert.equal(guardadoDelTexto(con), 1760000000123);
  assert.equal(guardadoDelTexto('{"guardado":42,"v":1}'), 42, "jsonb puede devolver las claves en otro orden");
  assert.equal(guardadoDelTexto(base), null);
  assert.throws(() => conGuardado("[1]", 1));
});

test("gzip de ida y vuelta (Blob, bytes y base64): el texto vuelve igual, acentos incluidos", async () => {
  const texto = ejemplo();
  const gz = await comprimir(texto);
  assert.ok(gz.size < texto.length / 5, `comprime: ${gz.size} de ${texto.length}`);
  assert.equal(await descomprimir(gz), texto);
  const bytes = new Uint8Array(await gz.arrayBuffer());
  assert.equal(await descomprimir(bytes), texto);
  assert.equal(await descomprimir(Buffer.from(bytes).toString("base64")), texto);
});

test("diaDeCajaEn: la caja corre de 12 a 12 en la hora del club (Argentina, UTC−3)", () => {
  const e = M.crearClubReal("2026-10-17");
  assert.equal(diaDeCajaEn(e, Date.UTC(2026, 9, 17, 14, 59)), "2026-10-16", "11:59 del sábado: caja del viernes");
  assert.equal(diaDeCajaEn(e, Date.UTC(2026, 9, 17, 15, 0)), "2026-10-17", "12:00 del sábado: caja del sábado");
  assert.equal(diaDeCajaEn(e, Date.UTC(2026, 9, 18, 3, 40)), "2026-10-17", "00:40 del domingo: sigue la del sábado");
});

test("resumen del respaldo de ejemplo: caja = cobrado al centavo, monedero aparte, cajas sin cerrar y PIN sin mostrarlos", () => {
  const l = leerSobre(ejemplo());
  assert.ok(l.ok);
  const r = resumenDelRespaldo(l.estado);
  assert.equal(r.caja.cuadra, true);
  assert.equal(r.caja.ingresos, r.caja.cobradoCanchas + r.caja.cobradoCuentas);
  assert.ok(r.caja.monedero > 0, "hay un pago con créditos y no entró a la caja");
  assert.equal(r.porDia.reduce((s, d) => s + d.ingresos, 0), r.caja.ingresos, "las cajas por día suman el total");
  assert.deepEqual(r.cajasSinCerrar, M.cajasConMovimientosSinCerrar(l.estado));
  assert.ok(r.cajasSinCerrar.includes("2026-10-18"), "lo cobrado después del cierre queda en la caja siguiente");
  assert.equal(r.porDia.find((d) => d.dia === "2026-10-17")?.cerrada, true);
  assert.deepEqual(r.pin, { usuariosActivos: 3, conPin: 3, sinPin: [] });
  assert.ok(!JSON.stringify(r).includes('"11"'), "el resumen no lleva ningún PIN");
  assert.equal(r.conteos.cuentasAbiertas, 1, "la mesa del último turno sigue abierta");
});
