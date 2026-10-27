// La hoja «Vender» (Tanda 2A) sin pantalla, contra el motor REAL sobre la demo del día:
//   · BP-043 «Pasar a la cuenta de Carla»: el consumo va a su cuenta abierta y NO a la caja; todo o nada.
//   · cobro directo por medio (BP-041): el comando «venta» con cada medio entra a la caja con ESE medio, una vez.
//   · los dos comandos re-aplicados sobre la misma base dan el mismo estado byte a byte, se cuentan en criollo y no
//     llevan PIN; sobre una base donde otro puesto cerró la cuenta, «ventaACuenta» va a «Para resolver» sin pisar.
//   · el lector «siempre escuchando»: una ráfaga rápida + Enter es un código; lo que tipea una persona, no.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo, textoDelEstado } from "./almacen";
import { comandoSinPin, correrComando, describirComando, queHizo, rebasar, vaSinInternet, type ArgsDe, type Comando, type NombreDeComando } from "./comandos-core";
import { MEDIOS_CAJA } from "./cuenta-core";
import { crearLector, cuentasParaPasar, pasarVentaACuenta } from "./vender-core";

const HOY = "2026-10-22";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };

function base(ajustar?: (e: EstadoClub) => void): { texto: string; abrir: () => EstadoClub } {
  M.prefijoIds("");
  const e = M.generarDemo(HOY, AHORA.min);
  ajustar?.(e);
  const texto = textoDelEstado(e);
  return { texto, abrir: () => (JSON.parse(texto) as { estado: EstadoClub }).estado };
}

/** La demo con la cuenta abierta de Carla (como si la hubieran abierto en Buffet). */
const conCarla = (e: EstadoClub) => {
  const r = M.abrirCuenta(e, { titular: "Carla Gómez", clienteId: null }, AHORA);
  assert.equal(r.ok, true);
};
const carla = (e: EstadoClub) => e.cuentas.find((c) => c.titular === "Carla Gómez" && c.estado === "abierta")!;
const recepcion = (e: EstadoClub): Auth => operadorDeLaDemo(e, "RECEPTION")!.auth;
const ingresosDeCaja = (e: EstadoClub) => e.caja.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
const stockDe = (e: EstadoClub, id: string) => e.productos.find((p) => p.id === id)!.stock;

let n = 0;
function enElMostrador<N extends NombreDeComando>(e: EstadoClub, nombre: N, args: ArgsDe<N>, auth = recepcion(e)): Comando<N> {
  const c: Comando<N> = { id: `v-${++n}`, equipo: "mostrador-1", persona: auth.usuarioId ?? "", versionBase: 3, version: M.VERSION_ESTADO, nombre, args, ahora: AHORA, auth, azar: 5000 + n, idsDesde: M.secuenciaIds() };
  const d = correrComando(e, c);
  assert.equal(d.ok, true, `${nombre}: ${d.mensaje}`);
  return c;
}

test("BP-043 · «Pasar a la cuenta de Carla»: el consumo va a su cuenta abierta, baja el stock y NO entra a la caja", () => {
  const e = base(conCarla).abrir();
  const caja = ingresosDeCaja(e);
  const movimientos = e.caja.movimientos.length;
  const agua = stockDe(e, "p2")!;
  const d = pasarVentaACuenta(e, carla(e).id, { p2: 2, p9: 1 }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, "$ 7.800 a la cuenta de Carla Gómez (3 productos). No entró a la caja: se cobra con su cuenta.");
  const cta = carla(e);
  assert.deepEqual(cta.items.map((i) => [i.productoId, i.cant, i.precioUnit]), [["p2", 2, 2000], ["p9", 1, 3800]]);
  assert.equal(M.saldoCuenta(cta), 7800, "Carla debe lo que se llevó");
  assert.equal(cta.pagos.length, 0);
  assert.equal(ingresosDeCaja(e), caja, "la caja no se movió");
  assert.equal(e.caja.movimientos.length, movimientos);
  assert.equal(stockDe(e, "p2"), agua - 2, "el stock baja como en cualquier cargo");
});

test("pasar a la cuenta: todo o nada (stock que no alcanza, alquiler, cuenta cerrada, carrito vacío)", () => {
  const e = base(conCarla).abrir();
  const antes = JSON.stringify(e);
  const id = carla(e).id;
  const pala = e.productos.find((p) => p.alquiler)!;
  const shop = e.productos.find((p) => p.id === "p7")!;
  for (const [carrito, motivo] of [
    [{ p2: 1, p7: (shop.stock ?? 0) + 1 }, /No alcanza el stock de Pala Break Point/],
    [{ p2: 1, [pala.id]: 1 }, /es de alquiler/],
    [{}, /No hay nada cargado/],
    [{ p2: 0 }, /No hay nada cargado/],
    [{ "no-existe": 1 }, /No encuentro un producto/],
  ] as const) {
    const d = pasarVentaACuenta(e, id, carrito, AHORA);
    assert.equal(d.ok, false);
    assert.match(d.mensaje, motivo);
  }
  assert.equal(JSON.stringify(e), antes, "nada cambió: ni el agua se cargó");
  M.cerrarCuenta(e, id, {}, AHORA);
  const cerrada = pasarVentaACuenta(e, id, { p2: 1 }, AHORA);
  assert.equal(cerrada.ok, false);
  assert.match(cerrada.mensaje, /ya no está abierta/);
});

test("las cuentas para pasar: las abiertas a nombre de alguien, por nombre, con lo que deben; nunca las del mostrador", () => {
  const e = base(conCarla).abrir();
  M.abrirCuenta(e, { titular: "Mostrador", reservaId: "mostrador-999" }, AHORA);
  const lista = cuentasParaPasar(e);
  assert.ok(lista.some((c) => c.titular === "Carla Gómez" && c.debe === 0));
  assert.ok(!lista.some((c) => c.titular === "Mostrador"));
  assert.ok(lista.every((c) => e.cuentas.find((x) => x.id === c.id)!.estado === "abierta"));
  const nombres = lista.map((c) => c.titular);
  assert.deepEqual(nombres, [...nombres].sort((a, b) => a.localeCompare(b, "es")));
});

test("cobro directo por medio: «venta» con cada medio entra a la caja UNA vez, con ESE medio y el total exacto", () => {
  for (const medio of MEDIOS_CAJA) {
    const e = base().abrir();
    const antes = e.caja.movimientos.length;
    enElMostrador(e, "venta", [{ p9: 1 }, medio]);
    const nuevos = e.caja.movimientos.slice(antes);
    assert.equal(nuevos.length, 1, medio);
    assert.deepEqual([nuevos[0].tipo, nuevos[0].medio, nuevos[0].monto], ["ingreso", medio, 3800]);
  }
});

const CASOS: { nombre: NombreDeComando; args: (e: EstadoClub) => unknown; texto: RegExp }[] = [
  { nombre: "ventaACuenta", args: (e) => [carla(e).id, { p2: 2, p9: 1 }], texto: /^Venta de mostrador \(3 productos\) a la cuenta de Carla Gómez$/ },
  { nombre: "venta", args: () => [{ p9: 1 }, "efectivo"], texto: /^Venta de mostrador \(1 producto\) efectivo$/ },
  { nombre: "venta", args: () => [{ p2: 1, p3: 2 }, "mercadopago"], texto: /Mercado Pago$/ },
];
for (const caso of CASOS) {
  test(`comando «${caso.nombre}» de la hoja Vender: re-aplicado sobre la misma base da lo mismo byte a byte, en criollo y sin PIN`, () => {
    const b = base(conCarla);
    const local = b.abrir();
    const c = enElMostrador(local, caso.nombre, caso.args(local) as ArgsDe<typeof caso.nombre>);
    base(conCarla); // recargar la página
    const deNuevo = b.abrir();
    const r = rebasar(deNuevo, [c], new Set());
    assert.deepEqual(r.rechazados, []);
    assert.equal(JSON.stringify(deNuevo), JSON.stringify(local), "el mismo estado, byte a byte");
    assert.match(queHizo(c, b.abrir()), caso.texto);
    assert.doesNotMatch(describirComando(c, deNuevo), /Operación «/);
    assert.doesNotMatch(JSON.stringify(comandoSinPin(c)), /"pin"/);
    // Idempotencia: si ya subió, no se aplica dos veces.
    const otra = b.abrir();
    const r2 = rebasar(otra, [c], new Set([c.id]));
    assert.equal(r2.salteados.length, 1);
    assert.equal(JSON.stringify(otra), JSON.stringify(b.abrir()));
  });
}

test("«ventaACuenta» sobre una base donde otro puesto ya cerró la cuenta: va a «Para resolver», no se fuerza", () => {
  const b = base(conCarla);
  const local = b.abrir();
  const c = enElMostrador(local, "ventaACuenta", [carla(local).id, { p2: 1 }]);
  base(conCarla);
  const enLaBase = b.abrir();
  M.cerrarCuenta(enLaBase, carla(enLaBase).id, {}, AHORA); // la PC cerró la cuenta de Carla en cero
  const antes = JSON.stringify(enLaBase);
  const r = rebasar(enLaBase, [c], new Set());
  assert.equal(r.rechazados.length, 1);
  assert.match(r.rechazados[0].motivo, /ya no está abierta/);
  assert.equal(JSON.stringify(enLaBase), antes, "lo del otro puesto queda como estaba");
});

test("qué va sin internet: pasar a una cuenta sí (no mueve plata); vender en efectivo sí; con MP, transferencia o débito no", () => {
  assert.equal(vaSinInternet("ventaACuenta", ["cta-1", { p2: 1 }]), true);
  assert.equal(vaSinInternet("venta", [{ p2: 1 }, "efectivo"]), true);
  for (const m of ["mercadopago", "transferencia", "debito"]) assert.equal(vaSinInternet("venta", [{ p2: 1 }, m]), false, m);
});

test("el lector siempre escuchando: ráfaga rápida + Enter = código; tipeo de persona, teclas sueltas o cortas, no", () => {
  const lector = crearLector();
  const rafaga = (texto: string, desde: number, paso: number) => {
    let t = desde;
    for (const ch of texto) assert.equal(lector.tecla(ch, (t += paso)), null);
    return lector.tecla("Enter", t + paso);
  };
  assert.equal(rafaga("7790000000028", 1000, 8), "7790000000028", "el lector tipea cada ~8 ms");
  assert.equal(rafaga("BP-002", 5000, 15), "BP-002");
  assert.equal(rafaga("7790000000028", 9000, 180), null, "una persona tipeando no es el lector");
  assert.equal(rafaga("BP0", 20000, 8), null, "muy corto para ser un código");
  assert.equal(lector.tecla("Enter", 30000), null, "un Enter solo (apretar el botón enfocado) sigue de largo");
  // Una pausa en el medio arranca una ráfaga nueva: sólo cuenta lo último.
  let t = 40000;
  for (const ch of "12") lector.tecla(ch, (t += 8));
  t += 500;
  for (const ch of "BP-003") lector.tecla(ch, (t += 8));
  assert.equal(lector.tecla("Enter", t + 8), "BP-003");
  // Tab o una flecha cortan la ráfaga.
  t = 50000;
  for (const ch of "BP-0") lector.tecla(ch, (t += 8));
  lector.tecla("Tab", (t += 8));
  for (const ch of "02") lector.tecla(ch, (t += 8));
  assert.equal(lector.tecla("Enter", t + 8), null);
});
