// El Tablero del dueño contra el motor REAL sobre la demo: las novedades para autorizar (crédito con monto editable,
// accesos con el PIN que se muestra una sola vez), los indicadores, las canchas ahora, la semana, la caja y el log.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { armarTablero, ejecutarTablero, fechaCorta, pedidosDeCreditoPendientes } from "./tablero-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): { e: EstadoClub; recep: Auth; duenio: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  return { e, recep: operadorDeLaDemo(e, "RECEPTION")!.auth, duenio: operadorDeLaDemo(e, "OWNER")!.auth };
};

test("lo que espera al dueño: el pedido de cuenta corriente de la demo y el pedido de acceso", () => {
  const { e } = demo();
  const v = armarTablero(e, AHORA);
  assert.equal(pedidosDeCreditoPendientes(e), 1);
  assert.equal(v.pedidos.length, 1);
  assert.equal(v.pedidos[0].rotulo, "Cuenta corriente");
  assert.equal(v.pedidos[0].monto, 60000);
  assert.equal(v.pedidos[0].que, "cuenta corriente hasta $ 60.000");
  assert.equal(v.pedidos[0].pidio, "Lu (recepción tarde)");
  assert.equal(v.pedidos[0].nota, "Juega 3 veces por semana");
  assert.deepEqual(v.accesos.map((a) => a.nombre), ["Juli (recepción finde)"]);
  assert.equal(v.accesos[0].cuando, "16:30");
});

test("autorizar con el monto cambiado por el dueño; recepción no puede autorizar", () => {
  const { e, recep, duenio } = demo();
  const n = e.novedades[0];
  const r = ejecutarTablero(e, { tipo: "autorizar", novedadId: n.id, monto: "45.000" }, AHORA, recep);
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /no tiene permiso/);
  assert.equal(ejecutarTablero(e, { tipo: "autorizar", novedadId: n.id, monto: "" }, AHORA, duenio).ok, false);
  const d = ejecutarTablero(e, { tipo: "autorizar", novedadId: n.id, monto: "45.000" }, AHORA, duenio);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /habilitada hasta \$ 45\.000/);
  assert.deepEqual(M.cliente(e, n.clienteId)!.cc, { habilitada: true, limite: 45000 });
  assert.equal(pedidosDeCreditoPendientes(e), 0);
  assert.equal(armarTablero(e, AHORA).pedidos.length, 0);
  assert.equal(ejecutarTablero(e, { tipo: "autorizar", novedadId: n.id, monto: "1000" }, AHORA, duenio).ok, false, "ya se resolvió");
});

test("fiado: se autoriza una vez y queda para pasar a la cuenta corriente; rechazar no habilita nada", () => {
  const { e, recep, duenio } = demo();
  const fede = e.clientes.find((c) => c.nombre === "Federico Luna")!;
  const sol = M.solicitarCredito(e, { clienteId: fede.id, tipo: "fiado", monto: 22100 }, recep, AHORA);
  assert.ok(sol.ok);
  const v = armarTablero(e, AHORA);
  const p = v.pedidos.find((x) => x.tipo === "fiado")!;
  assert.equal(p.rotulo, "Fiado de hoy");
  assert.equal(p.que, "fiarle $ 22.100 (una vez, a su cuenta corriente)");
  const d = ejecutarTablero(e, { tipo: "autorizar", novedadId: p.id, monto: "22100" }, AHORA, duenio);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(M.puedeACuenta(M.cliente(e, fede.id), 22100).ok, true);
  assert.equal(M.cliente(e, fede.id)!.cc.habilitada, false, "el fiado no habilita la cuenta corriente");

  const otra = demo();
  const n = otra.e.novedades[0];
  const r = ejecutarTablero(otra.e, { tipo: "rechazar", novedadId: n.id }, AHORA, otra.duenio);
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(M.cliente(otra.e, n.clienteId)!.cc.habilitada, false);
  assert.equal(n.estado, "rechazada");
});

test("dar acceso: el motor genera un PIN de 2 dígitos que vuelve UNA vez y no queda en el aviso ni en «qué pasó hoy»", () => {
  const { e, recep, duenio } = demo();
  const s = e.solicitudesAcceso[0];
  assert.equal(ejecutarTablero(e, { tipo: "otorgar", solicitudId: s.id, rol: "recepcion" }, AHORA, recep).ok, false, "recepción no da accesos");
  const d = ejecutarTablero(e, { tipo: "otorgar", solicitudId: s.id, rol: "recepcion" }, AHORA, duenio);
  assert.equal(d.ok, true, d.mensaje);
  assert.ok(d.acceso);
  assert.match(d.acceso.pin, /^\d{2}$/);
  assert.equal(d.acceso.rol, "Recepción");
  assert.ok(!d.mensaje.includes(d.acceso.pin), "el PIN no va en el aviso");
  const v = armarTablero(e, AHORA);
  assert.ok(!v.log.some((l) => l.texto.includes(`PIN ${d.acceso!.pin}`) || l.texto.endsWith(d.acceso!.pin)));
  assert.equal(v.accesos.length, 0);
  const u = e.usuarios.find((x) => x.nombre === "Juli (recepción finde)")!;
  assert.equal(u.rol, "recepcion");
  assert.equal(new Set(e.usuarios.filter((x) => x.activo).map((x) => x.pin)).size, e.usuarios.filter((x) => x.activo).length, "PIN que no repite");
  assert.equal(ejecutarTablero(e, { tipo: "otorgar", solicitudId: s.id, rol: "recepcion" }, AHORA, duenio).ok, false, "ya se otorgó");
});

test("rechazar un pedido de acceso", () => {
  const { e, duenio } = demo();
  const s = e.solicitudesAcceso[0];
  const d = ejecutarTablero(e, { tipo: "rechazarAcceso", solicitudId: s.id }, AHORA, duenio);
  assert.equal(d.ok, true);
  assert.equal(d.mensaje, "Pedido de acceso de Juli (recepción finde) rechazado.");
  assert.equal(armarTablero(e, AHORA).accesos.length, 0);
  assert.equal(e.usuarios.length, 4, "no se creó nadie");
});

test("indicadores, canchas ahora, semana, caja por medio, platos y «qué pasó hoy» salen del motor", () => {
  const { e } = demo();
  const v = armarTablero(e, AHORA);
  const k = M.kpis(e, HOY, AHORA);
  assert.equal(v.indicadores.length, 7);
  assert.equal(v.indicadores[0].valor, `${Math.round(k.ocupacion * 100)} %`);
  assert.equal(v.indicadores[1].valor, M.pesos(k.vendido));
  assert.equal(v.hora, "19:10");
  assert.equal(v.canchas.length, e.canchas.length);
  const jugando = v.canchas.filter((c) => c.juego);
  assert.ok(jugando.length >= 1);
  for (const c of jugando) assert.ok(c.juego!.avance >= 0 && c.juego!.avance <= 1);
  assert.equal(v.calor.filas.length, 7);
  assert.equal(v.calor.filas.at(-1)!.fecha, HOY);
  assert.equal(v.calor.filas.at(-1)!.dia, fechaCorta(HOY));
  assert.equal(fechaCorta(HOY), "sáb 17/10");
  for (const f of v.calor.filas) assert.equal(f.valores.length, v.calor.horas.length);
  assert.equal(v.caja.medios.reduce((s, m) => s + m.monto, 0), k.caja.neto, "los medios suman el neto de la caja");
  assert.equal(v.caja.neto, k.caja.neto);
  assert.ok(v.caja.medios.some((m) => m.proporcion === 1), "la barra más larga es la del medio con más plata");
  assert.ok(v.platos.filas.length > 0);
  assert.ok(Math.abs(v.platos.filas.reduce((s, f) => s + f.participacion, 0) - 1) < 1e-9);
  assert.equal(v.log[0].texto, e.log[0].texto, "lo más nuevo primero");
});

test("la firma cambia cuando cambia lo que se ve", () => {
  const { e, duenio } = demo();
  const a = armarTablero(e, AHORA).firma;
  assert.equal(armarTablero(e, AHORA).firma, a);
  ejecutarTablero(e, { tipo: "rechazarAcceso", solicitudId: e.solicitudesAcceso[0].id }, AHORA, duenio);
  assert.notEqual(armarTablero(e, AHORA).firma, a);
});
