// Reglas puras de los pedidos a la cuadrilla (GSG-MIA-062, criterio 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarCierre, dondeDeLaVista, pasoElTope, REGLA, RESPUESTA_OPORTUNIDAD, TOPE, topeDe } from "./pedidos";

test("oportunidad: siempre el texto fijo de traspaso, dueño COM, sin precio ni plazo", () => {
  const r = armarCierre({ salida: "OPORTUNIDAD" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.estado, "ESCALADO");
  assert.equal(r.salida, "OPORTUNIDAD");
  assert.equal(r.duenio, "COM");
  assert.equal(r.respuesta, RESPUESTA_OPORTUNIDAD);
  assert.doesNotMatch(r.respuesta, /\$|\d|precio|plazo|hoy|mañana|semana/i);
});

test("negado: exige la regla «puesto §n» y lo que sí puede hacer", () => {
  assert.equal(armarCierre({ salida: "AJENO", regla: "porque no", queSi: "verificar eventos" }).ok, false);
  assert.equal(armarCierre({ salida: "AJENO", regla: "verificador §2", queSi: "" }).ok, false);
  const r = armarCierre({ salida: "AJENO", regla: "verificador §2", queSi: "verificar fecha y lugar de eventos." });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.estado, "NEGADO");
  assert.equal(r.regla, "verificador §2");
  assert.match(r.respuesta, /Gracias.*verificador §2.*Lo que sí puedo hacer: verificar/);
});

test("hecho: exige contar qué se hizo", () => {
  assert.equal(armarCierre({ salida: "HECHO", respuesta: "  " }).ok, false);
  assert.equal(armarCierre({ salida: "HECHO", respuesta: "Verifiqué 3 eventos." }).ok, true);
});

test("la regla cita el manual", () => {
  for (const ok of ["verificador §2", "cobranzas §3.2", "armador de briefs § 1"]) assert.match(ok, REGLA);
  for (const mal of ["§2", "lo resolví como pude", "2 verificador"]) assert.doesNotMatch(mal, REGLA);
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
