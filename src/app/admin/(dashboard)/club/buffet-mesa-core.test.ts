// La mesa compleja y la venta de mostrador contra el motor REAL sobre la demo del día. Propiedades de plata:
//   · lo que se pasa de una cuenta a otra sale de una y entra en la otra por el mismo monto (y la caja no se mueve);
//   · un descuento nunca pasa sin el PIN de un dueño y nunca deja la cuenta en negativo (ni debajo de lo pagado);
//   · la venta de mostrador: la caja sube exactamente lo cobrado, baja el stock y no deja cuentas abiertas;
//   · «Deshacer» sigue la regla del club vanilla (su DESHACIBLES).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { DESHACIBLE_BUFFET, EN_EL_VANILLA_BUFFET, armarBuffet, ejecutarBuffet } from "./buffet-core";
import {
  DESHACIBLE_MESA,
  ESPERA_DE_PIN_MS,
  INTENTOS_DE_PIN,
  SIN_INTENTOS,
  VENTA_DESHACIBLE,
  anotarIntentoDePin,
  armarCarrito,
  ejecutarMesa,
  esperaDelPin,
  pinesDeEjemplo,
  productosParaMostrador,
  quienFirma,
  sumarAlCarrito,
  venderEnMostrador,
  type Carrito,
} from "./buffet-mesa-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): { e: EstadoClub; auth: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  return { e, auth: operadorDeLaDemo(e, "RECEPTION")!.auth };
};
const caja = (e: EstadoClub) => M.resumenCaja(e).ingresos;
const abiertas = (e: EstadoClub) => M.cuentasAbiertas(e);
const total = (e: EstadoClub, id: string) => M.totalCuenta(M.cuenta(e, id)!);
const sumaTotales = (e: EstadoClub) => abiertas(e).reduce((s, c) => s + M.totalCuenta(c), 0);
const PIN_DUENIO = () => M.USUARIOS_DEMO.find((u) => u.rol === "duenio")!;
const PIN_RECEPCION = () => M.USUARIOS_DEMO.find((u) => u.rol === "recepcion")!;

test("«Deshacer» en el buffet sigue la regla del club vanilla (DESHACIBLES de app.mjs)", () => {
  const app = readFileSync(new URL("../../../../../public/previews/breakpoint/club/app.mjs", import.meta.url), "utf8");
  const vanilla = new Set(JSON.parse(/const DESHACIBLES = new Set\((\[[^\]]*\])\)/.exec(app)![1]) as string[]);
  for (const [tipo, deshace] of Object.entries(DESHACIBLE_BUFFET)) assert.equal(deshace, vanilla.has(EN_EL_VANILLA_BUFFET[tipo as keyof typeof EN_EL_VANILLA_BUFFET]), tipo);
  assert.equal(DESHACIBLE_MESA.pasarCargo, vanilla.has("pasarCargo"));
  assert.equal(DESHACIBLE_MESA.cargoManual, vanilla.has("cargoManual"));
  assert.equal(VENTA_DESHACIBLE, vanilla.has("cobrarMostrador"));
  assert.equal(vanilla.has("pedirFiado") || vanilla.has("aprobarCodigo"), false, "pedir el OK y tipear el código no se deshacen");
});

test("cada cuenta del buffet sabe a qué otras cuentas puede pasar un cargo (no a sí misma ni a la venta de mostrador)", () => {
  const { e } = demo();
  const b = armarBuffet(e, AHORA);
  assert.ok(b.cuentas.length >= 2, "la demo trae varias cuentas abiertas");
  for (const c of b.cuentas) {
    assert.ok(!c.destinos.some((x) => x.id === c.id));
    assert.equal(c.destinos.length, b.cuentas.length - 1);
  }
});

test("pasar un cargo: sale de una cuenta y entra en la otra por el mismo monto; la caja no se mueve", () => {
  const { e, auth } = demo();
  const de = abiertas(e).find((c) => c.items.some((i) => i.precioUnit > 0))!;
  const a = abiertas(e).find((c) => c.id !== de.id)!;
  const idx = de.items.findIndex((i) => i.precioUnit > 0);
  const item = de.items[idx];
  const [totDe, totA, caja0, suma0] = [total(e, de.id), total(e, a.id), caja(e), sumaTotales(e)];
  const n = item.cant >= 2 ? 1 : null;
  const movido = (n ?? item.cant) * item.precioUnit;
  const d = ejecutarMesa(e, { tipo: "pasarCargo", cuentaId: de.id, itemIdx: idx, aCuentaId: a.id, cant: n }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, new RegExp(`pasó a la cuenta de ${a.titular}`));
  assert.equal(totDe - total(e, de.id), movido, "sale de una");
  assert.equal(total(e, a.id) - totA, movido, "entra en la otra");
  assert.equal(sumaTotales(e), suma0);
  assert.equal(caja(e), caja0);
  assert.equal(M.cuenta(e, a.id)!.items.at(-1)!.transferidoDe, de.titular);
  assert.equal(ejecutarMesa(e, { tipo: "pasarCargo", cuentaId: de.id, itemIdx: 0, aCuentaId: de.id, cant: null }, AHORA, auth).ok, false, "a sí misma, no");
});

test("propiedad: pases al azar entre las cuentas abiertas nunca crean ni pierden plata", () => {
  let semilla = 99;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let t = 0; t < 40; t++) {
    const { e, auth } = demo();
    const suma0 = sumaTotales(e);
    const caja0 = caja(e);
    for (let k = 0; k < 15; k++) {
      const cs = abiertas(e);
      const de = cs[Math.floor(azar() * cs.length)];
      const a = cs[Math.floor(azar() * cs.length)];
      if (!de.items.length) continue;
      const idx = Math.floor(azar() * de.items.length);
      const item = de.items[idx];
      const cant = azar() < 0.4 ? null : Math.floor(azar() * (item.cant + 2));
      const [td, ta] = [M.totalCuenta(de), M.totalCuenta(a)];
      const d = ejecutarMesa(e, { tipo: "pasarCargo", cuentaId: de.id, itemIdx: idx, aCuentaId: a.id, cant }, AHORA, auth);
      if (d.ok) {
        const movido = (cant ?? item.cant) * item.precioUnit;
        assert.equal(td - M.totalCuenta(de), movido, `caso ${t}`);
        assert.equal(M.totalCuenta(a) - ta, movido, `caso ${t}`);
      } else {
        assert.deepEqual([M.totalCuenta(de), M.totalCuenta(a)], [td, ta], `caso ${t}: lo rechazado no mueve nada`);
      }
      assert.equal(sumaTotales(e), suma0, `caso ${t}: la plata de las cuentas no cambia`);
    }
    assert.equal(caja(e), caja0);
  }
});

test("descuento: sin PIN no pasa; con el PIN de recepción tampoco; con el de un dueño sí, y lo firma él", () => {
  const { e, auth } = demo();
  const c = abiertas(e)[0];
  const [tot0, caja0] = [M.totalCuenta(c), caja(e)];
  const base = { tipo: "cargoManual" as const, cuentaId: c.id, concepto: "Cumple de Rober", monto: 1000, descuento: true };
  const sinPin = ejecutarMesa(e, { ...base, pin: "  " }, AHORA, auth);
  assert.equal(sinPin.ok, false);
  assert.match(sinPin.mensaje, /PIN/);
  const deRecepcion = ejecutarMesa(e, { ...base, pin: PIN_RECEPCION().pin }, AHORA, auth);
  assert.equal(deRecepcion.ok, false);
  assert.equal(deRecepcion.pinAjeno, true);
  assert.equal(deRecepcion.mensaje, "Un descuento lo autoriza el dueño con su PIN.");
  const cualquiera = ejecutarMesa(e, { ...base, pin: "98" }, AHORA, auth);
  assert.equal(cualquiera.ok, false);
  assert.equal(cualquiera.pinAjeno, true);
  assert.equal(M.totalCuenta(c), tot0, "nada cambió");
  const duenio = PIN_DUENIO();
  assert.deepEqual(quienFirma(e, duenio.pin, auth), { auth: { usuarioId: duenio.id, pin: duenio.pin }, esDuenio: true });
  const ok = ejecutarMesa(e, { ...base, pin: duenio.pin }, AHORA, auth);
  assert.equal(ok.ok, true, ok.mensaje);
  assert.match(ok.mensaje, new RegExp(`lo autorizó ${duenio.nombre}`));
  assert.equal(M.totalCuenta(c), tot0 - 1000);
  assert.equal(c.items.at(-1)!.por, duenio.nombre);
  assert.equal(caja(e), caja0, "un descuento no toca la caja");
  // Un descuento no se pasa a otra cuenta.
  const otra = abiertas(e).find((x) => x.id !== c.id)!;
  assert.equal(ejecutarMesa(e, { tipo: "pasarCargo", cuentaId: c.id, itemIdx: c.items.length - 1, aCuentaId: otra.id, cant: null }, AHORA, auth).ok, false);
});

test("propiedad: descuentos al azar con PIN al azar → nunca un total negativo, nunca por debajo de lo pagado y nunca sin un dueño", () => {
  let semilla = 2024;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pines = ["", "11", "22", "33", "44", "00", "1"];
  const duenios = new Set(M.USUARIOS_DEMO.filter((u) => u.rol === "duenio").map((u) => u.nombre));
  for (let t = 0; t < 40; t++) {
    const { e, auth } = demo();
    const c = abiertas(e)[t % abiertas(e).length];
    if (azar() < 0.5 && M.saldoCuenta(c) > 1000) M.pagarCuenta(e, c.id, { medio: "efectivo", monto: Math.floor(M.saldoCuenta(c) / 2) }, AHORA);
    for (let k = 0; k < 12; k++) {
      const descuento = azar() < 0.8;
      const monto = Math.floor(azar() * 30000);
      const antes = c.items.length;
      const d = ejecutarMesa(e, { tipo: "cargoManual", cuentaId: c.id, concepto: "Ajuste", monto, descuento, pin: pines[Math.floor(azar() * pines.length)] }, AHORA, auth);
      assert.ok(M.totalCuenta(c) >= 0, `caso ${t}: total negativo`);
      assert.ok(M.totalCuenta(c) >= M.cobradoCuenta(c), `caso ${t}: debajo de lo pagado`);
      if (d.ok && descuento && monto > 0) assert.ok(duenios.has(c.items[antes].por ?? ""), `caso ${t}: un descuento sin dueño`);
      if (!d.ok) assert.equal(c.items.length, antes, `caso ${t}: lo rechazado no carga nada`);
    }
  }
});

test("cargo manual (no descuento): no pide PIN, suma a la cuenta y al cobrar la cuenta cierra en cero con caja = cobrado", () => {
  const { e, auth } = demo();
  const c = abiertas(e).find((x) => !x.aCargoDe && !e.cuentas.some((y) => y.estado === "abierta" && y.aCargoDe === x.id))!;
  const tot0 = M.totalCuenta(c);
  const d = ejecutarMesa(e, { tipo: "cargoManual", cuentaId: c.id, concepto: "Torta", monto: 5000, descuento: false, pin: "" }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(M.totalCuenta(c), tot0 + 5000);
  assert.equal(ejecutarMesa(e, { tipo: "cargoManual", cuentaId: c.id, concepto: "", monto: 5000, descuento: false, pin: "" }, AHORA, auth).ok, false, "sin concepto, no");
  assert.equal(ejecutarMesa(e, { tipo: "cargoManual", cuentaId: c.id, concepto: "X", monto: 0, descuento: false, pin: "" }, AHORA, auth).ok, false, "sin monto, no");
  const [caja0, debe] = [caja(e), M.saldoCuenta(c)];
  assert.equal(ejecutarBuffet(e, { tipo: "cobrar", cuentaId: c.id, medio: "efectivo" }, AHORA, auth).ok, true);
  assert.equal(caja(e) - caja0, debe);
  assert.equal(M.saldoCuenta(c), 0);
  assert.equal(c.estado, "cerrada");
});

test("venta de mostrador: la caja sube exactamente el total, baja el stock y no queda ninguna cuenta abierta", () => {
  const { e } = demo();
  const vendibles = productosParaMostrador(e, "").productos;
  assert.ok(vendibles.length >= 2);
  assert.ok(!vendibles.some((p) => M.producto(e, p.id)!.alquiler), "lo de alquiler no se ofrece");
  const [p1, p2] = vendibles;
  let carrito: Carrito = {};
  carrito = sumarAlCarrito(carrito, p1.id, 1);
  carrito = sumarAlCarrito(carrito, p1.id, 1);
  carrito = sumarAlCarrito(carrito, p2.id, 1);
  carrito = sumarAlCarrito(carrito, p2.id, -1);
  assert.deepEqual(carrito, { [p1.id]: 2 }, "en cero sale del carrito");
  carrito = sumarAlCarrito(carrito, p2.id, 3);
  const vista = armarCarrito(e, carrito);
  assert.equal(vista.total, 2 * p1.precio + 3 * p2.precio);
  const [caja0, abiertas0] = [caja(e), abiertas(e).length];
  const stock = (id: string) => M.producto(e, id)!.stock;
  const [s1, s2] = [stock(p1.id), stock(p2.id)];
  const d = venderEnMostrador(e, carrito, "mercadopago", AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(caja(e) - caja0, vista.total, "caja = cobrado");
  assert.equal(abiertas(e).length, abiertas0, "no deja cuentas abiertas");
  if (s1 != null) assert.equal(stock(p1.id), s1 - 2);
  if (s2 != null) assert.equal(stock(p2.id), s2 - 3);
  assert.equal(venderEnMostrador(e, {}, "efectivo", AHORA).ok, false, "vacío, no");
  assert.equal(venderEnMostrador(e, carrito, "monedero" as never, AHORA).ok, false, "con créditos, no");
  const alquiler = e.productos.find((p) => p.alquiler);
  if (alquiler) assert.equal(venderEnMostrador(e, { [alquiler.id]: 1 }, "efectivo", AHORA).ok, false, "alquiler, no");
  assert.equal(caja(e) - caja0, vista.total, "lo rechazado no toca la caja");
});

test("tope del PIN: con 5 PIN equivocados se espera 30 s; uno bueno vuelve a cero", () => {
  let i = SIN_INTENTOS;
  for (let k = 1; k < INTENTOS_DE_PIN; k++) {
    i = anotarIntentoDePin(i, false, 1000);
    assert.equal(esperaDelPin(i, 1000), 0, `${k} mal: todavía se puede`);
  }
  i = anotarIntentoDePin(i, false, 1000);
  assert.equal(esperaDelPin(i, 1000), ESPERA_DE_PIN_MS / 1000);
  assert.equal(esperaDelPin(i, 1000 + ESPERA_DE_PIN_MS), 0, "a los 30 s se puede de nuevo");
  assert.deepEqual(anotarIntentoDePin(anotarIntentoDePin(SIN_INTENTOS, false, 0), true, 0), SIN_INTENTOS);
});

test("los PIN de ejemplo son los de los dueños de la demo (los que se muestran rotulados sólo en la demo)", () => {
  const { e } = demo();
  assert.deepEqual(
    pinesDeEjemplo(e),
    M.USUARIOS_DEMO.filter((u) => u.rol === "duenio").map((u) => ({ nombre: u.nombre, pin: u.pin })),
  );
  assert.deepEqual(pinesDeEjemplo(M.crearClubReal(HOY)), [], "en la jornada real, al arrancar, ningún dueño tiene PIN para mostrar");
});
