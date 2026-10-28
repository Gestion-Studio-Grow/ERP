// Un solo tope para todo PIN del equipo: la caja y el descuento del buffet cuentan en el MISMO contador que el bloqueo
// (`gsg-club:<negocio>:intentos-bloqueo:v1`), con su escalera 30 s → 2 min → 10 min. Lo que no evaluó un PIN no cuenta.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { ESPERAS_DEL_BLOQUEO_MS, INTENTOS_DEL_BLOQUEO, SIN_INTENTOS_DEL_BLOQUEO, claveDeIntentosDelBloqueo, guardaDelBloqueo, probarPin } from "./bloqueo-core";
import { ejecutarMesa } from "./buffet-mesa-core";
import { ejecutarCaja } from "./caja-core";
import { conTopeDePin, guardaDelPin, type DesenlaceConPin } from "./tope-de-pin";
import type { Almacen } from "./almacen";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };

/** Un localStorage de mentira (lo que comparte una pestaña con la que se abre al recargar). */
function almacenamiento(): Storage {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  } as unknown as Storage;
}

const malo = (mensaje = "PIN incorrecto."): DesenlaceConPin => ({ ok: false, mensaje, pin: "malo" });

test("5 PIN mal traban 30 s (y el que traba lo dice); trabado no corre; a los 30 s se prueba de nuevo y uno bueno de un dueño vuelve a cero", () => {
  const g = guardaDelBloqueo(almacenamiento(), claveDeIntentosDelBloqueo("breakpoint"));
  for (let k = 1; k < INTENTOS_DEL_BLOQUEO; k++) assert.equal(conTopeDePin(g, 1000, () => malo()).desenlace.mensaje, `PIN incorrecto (${k} de ${INTENTOS_DEL_BLOQUEO}).`);
  assert.equal(conTopeDePin(g, 1000, () => malo()).desenlace.mensaje, "PIN incorrecto. Demasiados PIN equivocados: esperá 30 segundos.");
  const trabado = conTopeDePin(g, 2000, () => assert.fail("trabado: no corre"));
  assert.equal(trabado.trabado, true);
  assert.deepEqual(trabado.desenlace, { ok: false, mensaje: "Demasiados PIN equivocados: esperá 29 segundos.", pin: null });
  const bueno = conTopeDePin(g, 1000 + ESPERAS_DEL_BLOQUEO_MS[0], () => ({ ok: true, mensaje: "Listo.", pin: "bueno" as const, duenio: true }));
  assert.equal(bueno.desenlace.mensaje, "Listo.");
  assert.deepEqual(g.leer(), SIN_INTENTOS_DEL_BLOQUEO);
});

test("M2: lo que no llegó a evaluar el PIN (pin: null) no cuenta ni vuelve el contador a cero", () => {
  const g = guardaDelBloqueo(almacenamiento(), claveDeIntentosDelBloqueo("breakpoint"));
  conTopeDePin(g, 0, () => malo());
  conTopeDePin(g, 0, () => malo());
  for (let k = 0; k < 10; k++) conTopeDePin(g, 0, () => ({ ok: false, mensaje: "Poné el monto.", pin: null }));
  assert.equal(g.leer().fallos, 2);
});

test("es EL contador del bloqueo: lo que falla en la caja suma al del bloqueo, la espera del bloqueo traba la caja, y recargar no lo borra", () => {
  const ls = almacenamiento();
  const clave = claveDeIntentosDelBloqueo("breakpoint");
  const e = M.generarDemo(HOY, AHORA.min);
  const recepcion = operadorDeLaDemo(e, "RECEPTION")!.auth;
  const delBloqueo = guardaDelBloqueo(ls, clave);
  // 3 mal en el bloqueo…
  let i = delBloqueo.leer();
  for (let k = 0; k < 3; k++) {
    const r = probarPin(e, recepcion.usuarioId!, "00", i, 1000);
    assert.equal(r.tipo, "malo");
    if (r.tipo === "malo") i = r.intentos;
  }
  delBloqueo.guardar(i);
  // …y 2 mal en la caja (otra guarda, como otra pantalla o la pestaña recargada) traban todo el equipo.
  const deLaCaja = guardaDelBloqueo(ls, clave);
  const egreso = (pin: string, ahora: number) => conTopeDePin(deLaCaja, ahora, () => ejecutarCaja(e, { tipo: "egreso", monto: "1000", concepto: "Hielo", pin }, AHORA, recepcion));
  assert.equal(egreso("00", 1000).desenlace.mensaje, `PIN incorrecto (4 de ${INTENTOS_DEL_BLOQUEO}).`);
  assert.match(egreso("00", 1000).desenlace.mensaje, /esperá 30 segundos/);
  assert.equal(probarPin(e, recepcion.usuarioId!, recepcion.pin!, guardaDelBloqueo(ls, clave).leer(), 2000).tipo, "espera", "el bloqueo también está trabado");
  // Ni con el PIN bueno se prueba mientras dura la espera; después, sí, pero el de recepción NO borra la tanda (SEC-5).
  assert.equal(egreso(recepcion.pin!, 2000).trabado, true);
  const despues = egreso(recepcion.pin!, 1000 + ESPERAS_DEL_BLOQUEO_MS[0]);
  assert.equal(despues.trabado, false, "pasada la espera se prueba");
  assert.equal(despues.desenlace.pin, "bueno", despues.desenlace.mensaje);
  assert.match(despues.desenlace.mensaje, /PIN de 4 dígitos/, "el PIN de 2 opera pero no firma el egreso (D-16)");
  assert.equal(guardaDelBloqueo(ls, clave).leer().tandas, 1, "la próxima tanda de 5 mal ya espera 2 minutos");
});

test("la segunda tanda de 5 mal traba 2 minutos, también si la cierra el descuento del buffet", () => {
  const ls = almacenamiento();
  const g = guardaDelBloqueo(ls, claveDeIntentosDelBloqueo("breakpoint"));
  const e = M.generarDemo(HOY, AHORA.min);
  const auth: Auth = operadorDeLaDemo(e, "RECEPTION")!.auth;
  const c = M.cuentasAbiertas(e)[0];
  const descuento = (ahora: number) =>
    conTopeDePin(g, ahora, () => ejecutarMesa(e, { tipo: "cargoManual", cuentaId: c.id, concepto: "Cumple", monto: 1000, descuento: true, pin: "0000" }, AHORA, auth));
  for (let k = 0; k < INTENTOS_DEL_BLOQUEO; k++) descuento(0);
  const t = ESPERAS_DEL_BLOQUEO_MS[0];
  for (let k = 0; k < INTENTOS_DEL_BLOQUEO - 1; k++) descuento(t);
  assert.match(descuento(t).desenlace.mensaje, /esperá 2 minutos\.$/);
  assert.equal(descuento(t + 1000).trabado, true);
});

test("ejecutarCaja dice qué pasó con el PIN: el fondo y el envío sin PIN no lo miran; uno ajeno es malo; el propio, bueno aunque el motor diga que no por otra cosa", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const recepcion = operadorDeLaDemo(e, "RECEPTION")!.auth;
  const duenio = operadorDeLaDemo(e, "OWNER")!.auth;
  assert.equal(ejecutarCaja(e, { tipo: "fondo", monto: "1000" }, AHORA, duenio).pin, null);
  assert.equal(ejecutarCaja(e, { tipo: "egreso", monto: "1000", concepto: "Hielo", pin: "  " }, AHORA, recepcion).pin, null);
  assert.equal(ejecutarCaja(e, { tipo: "egreso", monto: "1000", concepto: "Hielo", pin: duenio.pin! }, AHORA, recepcion).pin, "malo", "el PIN de otro no es el de quien opera");
  const sinConcepto = ejecutarCaja(e, { tipo: "egreso", monto: "1000", concepto: " ", pin: recepcion.pin! }, AHORA, recepcion);
  assert.deepEqual([sinConcepto.ok, sinConcepto.pin], [false, "bueno"]);
});

test("SEC-5: un acierto de recepción NO borra los fallos (4 PIN del dueño mal + el propio no arranca de nuevo); uno del dueño sí", () => {
  const ls = almacenamiento();
  const g = guardaDelBloqueo(ls, claveDeIntentosDelBloqueo("breakpoint"));
  const e = M.generarDemo(HOY, AHORA.min);
  const recepcion = operadorDeLaDemo(e, "RECEPTION")!.auth;
  const duenio = operadorDeLaDemo(e, "OWNER")!.auth;
  const c = M.cuentasAbiertas(e)[0];
  const descuento = (pin: string) =>
    conTopeDePin(g, 0, () => ejecutarMesa(e, { tipo: "cargoManual", cuentaId: c.id, concepto: "Cumple", monto: 100, descuento: true, pin }, AHORA, recepcion));
  for (let k = 0; k < INTENTOS_DEL_BLOQUEO - 1; k++) descuento("0000");
  // Recepción pone el suyo en la caja (bueno, pero no es dueño): los 4 fallos siguen.
  const egreso = conTopeDePin(g, 0, () => ejecutarCaja(e, { tipo: "egreso", monto: "100", concepto: "Hielo", pin: recepcion.pin! }, AHORA, recepcion));
  assert.equal(egreso.desenlace.pin, "bueno", egreso.desenlace.mensaje);
  assert.equal(egreso.desenlace.ok, false, "con el PIN de 2 no se firma el egreso (D-16)");
  assert.equal(g.leer().fallos, INTENTOS_DEL_BLOQUEO - 1);
  // El quinto traba.
  assert.match(descuento("0000").desenlace.mensaje, /esperá 30 segundos/);
  // Un dueño que firma bien (pasada la espera) sí vuelve a cero.
  const firma = conTopeDePin(g, ESPERAS_DEL_BLOQUEO_MS[0], () =>
    ejecutarMesa(e, { tipo: "cargoManual", cuentaId: c.id, concepto: "Cumple", monto: 100, descuento: true, pin: duenio.pin! }, AHORA, recepcion),
  );
  assert.equal(firma.desenlace.ok, true, firma.desenlace.mensaje);
  assert.deepEqual(g.leer(), SIN_INTENTOS_DEL_BLOQUEO);
});

test("guardaDelPin: una guarda por almacén y por negocio, sin importar quién llama primero", () => {
  const almacen = {} as Almacen;
  const sinNegocio = guardaDelPin(almacen, undefined);
  const delClub = guardaDelPin(almacen, "breakpoint");
  assert.notEqual(sinNegocio, delClub, "llamar primero sin negocio no deja pegada la clave del equipo");
  assert.equal(guardaDelPin(almacen, "breakpoint"), delClub);
  assert.equal(guardaDelPin(almacen, undefined), sinNegocio);
  assert.notEqual(guardaDelPin({} as Almacen, "breakpoint"), delClub, "otro almacén, otra guarda");
});
