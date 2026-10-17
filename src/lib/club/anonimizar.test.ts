// El anonimizador de respaldos del club y el fixture de ejemplo (BP-3).
//   · El fixture `respaldo-ejemplo.json` es EXACTAMENTE lo que arma el motor pasado por el anonimizador (si alguien
//     lo edita a mano o el motor cambia, esto avisa: se rearma con `npx tsx scripts/club/anonimizar-respaldo.ts --ejemplo`).
//   · Anonimizar no toca la plata: la caja de cada día da lo mismo al centavo.
//   · No queda ningún nombre, teléfono, usuario ni PIN original, tampoco DENTRO de los textos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as M from "./motor.mjs";
import { anonimizarSobre } from "./anonimizar";
import { leerSobre, resumenDelRespaldo, type Sobre } from "./foto";
import { RUTA_EJEMPLO, textoDelEjemplo } from "../../../scripts/club/anonimizar-respaldo";

test("el fixture de ejemplo es el sábado de torneo armado con el motor y anonimizado (reproducible)", () => {
  assert.equal(readFileSync(RUTA_EJEMPLO, "utf8"), textoDelEjemplo());
});

/** Un respaldo «como el real»: nombres completos, usuarios con id que lleva el nombre, PIN, teléfonos y alias de cobro. */
function respaldoConDatos(): Sobre {
  const e = M.generarDemo("2026-10-17");
  e.usuarios = [
    { id: "u-rober", nombre: "Roberto Ronco", rol: "duenio", pin: "73", activo: true },
    { id: "u-majo", nombre: "Majo Gimenez", rol: "duenio", pin: "48", activo: true },
    { id: "u-lu", nombre: "Lucía Paz", rol: "recepcion", pin: "19", activo: true },
  ];
  e.config.cobro = { ...e.config.cobro, alias: "club.real.mp" };
  const r = e.reservas[0];
  r.notas = "Avisó Roberto que llega tarde; paga Lucía";
  e.caja.movimientos.push({ id: "m-x", tipo: "egreso", medio: "efectivo", monto: 1000, concepto: "Hielo (lo pagó Majo Gimenez)", reservaId: null, usuario: "Majo Gimenez", fecha: "2026-10-17", min: 1000, caja: "2026-10-17" });
  return { v: 1, estado: e, secuencia: M.secuenciaIds(), usuario: "u-rober", guardado: 1760700000000 };
}

test("anonimizar: no queda ningún dato de una persona, ni suelto ni dentro de un texto", () => {
  const original = respaldoConDatos();
  const nombres = original.estado.clientes.map((c) => c.nombre);
  const tels = original.estado.clientes.map((c) => c.tel).filter(Boolean);
  const { sobre, informe } = anonimizarSobre(structuredClone(original));
  assert.deepEqual(informe.residuos, []);
  const salida = JSON.stringify(sobre);
  for (const n of [...nombres, "Roberto", "Ronco", "Majo", "Gimenez", "Lucía", "u-rober", "u-majo", "club.real.mp"]) {
    assert.ok(!salida.includes(n), `quedó «${n}»`);
  }
  for (const t of tels) assert.ok(!salida.includes(t), `quedó el teléfono ${t}`);
  assert.deepEqual(sobre.estado.usuarios.map((u) => [u.id, u.nombre, u.pin]), [["u-1", "Dueño 1", "11"], ["u-2", "Dueño 2", "22"], ["u-3", "Recepción 1", "33"]]);
  assert.equal(sobre.usuario, "u-1");
  // «Lucía» también es una clienta de la demo: la palabra suelta queda con el primer alias que la usa.
  assert.match(sobre.estado.reservas[0].notas ?? "", /^Avisó Dueño 1 que llega tarde; paga (Recepción 1|Cliente \d{3})$/);
  assert.equal(sobre.estado.caja.movimientos.at(-1)?.concepto, "Hielo (lo pagó Dueño 2)");
  // La misma persona, el mismo alias en todos lados.
  const c1 = original.estado.clientes[0];
  const alias = sobre.estado.clientes[0].nombre;
  assert.equal(alias, "Cliente 001");
  const deC1 = original.estado.reservas.filter((r) => r.clienteId === c1.id && r.titular === c1.nombre).map((r) => r.id);
  for (const id of deC1) assert.equal(sobre.estado.reservas.find((r) => r.id === id)?.titular, alias);
});

test("anonimizar no toca la plata: misma caja por día al centavo, mismos conteos, mismas cajas sin cerrar", () => {
  const original = respaldoConDatos();
  const antes = leerSobre(structuredClone(original));
  const despues = leerSobre(anonimizarSobre(structuredClone(original)).sobre);
  assert.ok(antes.ok && despues.ok);
  const a = resumenDelRespaldo(antes.estado);
  const d = resumenDelRespaldo(despues.estado);
  assert.deepEqual(d.porDia, a.porDia);
  assert.deepEqual(d.caja, a.caja);
  assert.deepEqual(d.conteos, a.conteos);
  assert.deepEqual(d.cajasSinCerrar, a.cajasSinCerrar);
  assert.equal(d.pin.conPin, a.pin.conPin);
});

test("anonimizar un respaldo ya anonimizado no marca sus propios alias como residuos", () => {
  const una = anonimizarSobre(respaldoConDatos()).sobre;
  assert.deepEqual(anonimizarSobre(structuredClone(una)).informe.residuos, []);
});
