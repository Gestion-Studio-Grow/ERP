// Reglas puras de los pedidos a la cuadrilla (GSG-MIA-062, criterio 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarCierre, cierreDelPedido, dondeDeLaVista, pasoElTope, queSiSinRepetir, RESPUESTA_OPORTUNIDAD, TOPE, topeDe } from "./pedidos";
import { clavePuesto, cruzarRegla, MANUALES } from "./manuales";

test("oportunidad: siempre el texto fijo de traspaso, dueño COM, sin precio ni plazo", () => {
  const r = armarCierre({ salida: "OPORTUNIDAD" }, "prospección");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.estado, "ESCALADO");
  assert.equal(r.salida, "OPORTUNIDAD");
  assert.equal(r.duenio, "COM");
  assert.equal(r.respuesta, RESPUESTA_OPORTUNIDAD);
  assert.doesNotMatch(r.respuesta, /\$|\d|precio|plazo|hoy|mañana|semana/i);
});

test("negado: exige la regla «puesto §n» de SU manual y lo que sí puede hacer", () => {
  assert.equal(armarCierre({ salida: "AJENO", regla: "porque no", queSi: "verificar eventos" }, "prospección").ok, false);
  assert.equal(armarCierre({ salida: "AJENO", regla: "prospección §2", queSi: "" }, "prospección").ok, false);
  const r = armarCierre({ salida: "AJENO", regla: "prospeccion §6", queSi: "verificar fecha y lugar de eventos." }, "Prospección");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.estado, "NEGADO");
  assert.equal(r.regla, "prospección §6", "se guarda con el nombre del manual");
  assert.match(r.respuesta, /Gracias.*prospección §6.*Lo que sí puedo hacer: verificar/);
});

test("la regla se cruza con el puesto del agente (GSG-MIA-072, hallazgo 1 de MIA-070)", () => {
  const no = (regla: string, puesto: string) => {
    const r = cruzarRegla(regla, puesto);
    assert.equal(r.ok, false, `${regla} con puesto ${puesto}`);
    return r.ok ? "" : r.motivo;
  };
  // El caso de MIA-070: un verificador citó «prospección §1». Sin manual propio, no niega con regla.
  assert.match(no("prospección §1", "verificador"), /no tiene manual cargado/);
  // Manual de otro puesto.
  assert.match(no("caja §1", "prospección"), /manual de otro puesto/);
  // El § no existe (prospección va de §1 a §11).
  assert.match(no("prospección §12", "prospección"), /no tiene §12: va de §1 a §11/);
  assert.match(no("prospección §0", "prospección"), /no tiene §0/);
  // Sub-pasos que el manual no numera, sin número, o al revés.
  for (const mal of ["prospección §6.2", "prospección §", "§2", "6 prospección", "lo resolví como pude"]) no(mal, "prospección");
  // Lo que sí: el § existe en el manual de su puesto; acentos, mayúsculas y espacios no importan.
  assert.deepEqual(cruzarRegla(" PROSPECCION § 11 ", "prospección"), { ok: true, regla: "prospección §11" });
  assert.deepEqual(cruzarRegla("dirección taller §17", "Dirección-Taller"), { ok: true, regla: "dirección-taller §17" });
  assert.deepEqual(cruzarRegla("caja §12", "caja"), { ok: true, regla: "caja §12" });
  // El catálogo: cada manual con su clave normalizada.
  for (const [clave, m] of Object.entries(MANUALES)) assert.equal(clavePuesto(m.nombre), clave);
});

test("«Lo que sí puedo hacer: …» sin repetir «puedo» (GSG-MIA-072, hallazgo 2 de MIA-070)", () => {
  assert.equal(queSiSinRepetir("Puedo verificar la fecha y el lugar."), "verificar la fecha y el lugar.");
  assert.equal(queSiSinRepetir("puedo  verificar"), "verificar");
  assert.equal(queSiSinRepetir("Lo que sí puedo hacer: verificar el CUIT"), "verificar el CUIT");
  assert.equal(queSiSinRepetir("Sí puedo armar el brief"), "armar el brief");
  assert.equal(queSiSinRepetir("Si el evento es en CABA, lo verifico"), "si el evento es en CABA, lo verifico");
  const r = armarCierre({ salida: "AJENO", regla: "prospección §6", queSi: "Puedo verificar proveedores de a uno." }, "prospección");
  assert.ok(r.ok && /Lo que sí puedo hacer: verificar proveedores de a uno\.$/.test(r.respuesta));
  assert.ok(r.ok && !/puedo hacer: [Pp]uedo/.test(r.respuesta));
});

test("hecho: exige contar qué se hizo", () => {
  assert.equal(armarCierre({ salida: "HECHO", respuesta: "  " }, "caja").ok, false);
  assert.equal(armarCierre({ salida: "HECHO", respuesta: "Verifiqué 3 eventos." }, "caja").ok, true);
});

test("el cierre de cada pedido se nombra por su salida (Oportunidades: «traspasado», con la fecha del traspaso)", () => {
  assert.equal(cierreDelPedido({ estado: "ESCALADO", salida: "OPORTUNIDAD" }), "traspasado a GSG");
  assert.equal(cierreDelPedido({ estado: "ESCALADO", salida: "TOPE" }), "escalado por tope");
  assert.equal(cierreDelPedido({ estado: "NEGADO", salida: "AJENO" }), "negado");
  assert.equal(cierreDelPedido({ estado: "ABIERTO", salida: null }), null);
});

test("tope: por minutos desde que se pidió o por turnos usados", () => {
  const t0 = new Date("2026-11-17T10:00:00Z");
  const p = { createdAt: t0, topeMinutos: 30, topeTurnos: 3, turnosUsados: 0 };
  assert.equal(pasoElTope(p, new Date("2026-11-17T10:29:59Z")), null);
  assert.equal(pasoElTope(p, new Date("2026-11-17T10:30:00Z")), "minutos");
  assert.equal(pasoElTope({ ...p, turnosUsados: 2 }, t0), null);
  assert.equal(pasoElTope({ ...p, turnosUsados: 3 }, t0), "turnos");
});

test("el tope del formulario queda dentro del rango; si no, el de por defecto", () => {
  assert.equal(topeDe("15", TOPE.minutos), 15);
  assert.equal(topeDe("9999", TOPE.minutos), TOPE.minutos.porDefecto);
  assert.equal(topeDe("", TOPE.turnos), TOPE.turnos.porDefecto);
  assert.equal(topeDe("2.5", TOPE.turnos), TOPE.turnos.porDefecto);
});

test("vistas de la lista: negados y oportunidades por separado", () => {
  assert.deepEqual(dondeDeLaVista("negados"), { estado: "NEGADO" });
  assert.deepEqual(dondeDeLaVista("oportunidades"), { estado: "ESCALADO", salida: "OPORTUNIDAD" });
  assert.deepEqual(dondeDeLaVista("topes"), { estado: "ESCALADO", salida: "TOPE" });
  assert.deepEqual(dondeDeLaVista("todos"), {});
});
