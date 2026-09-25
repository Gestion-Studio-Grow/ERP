// El tablero de la plataforma, ejecutado con datos: llaves, medición de la base, «¿anda todo?»,
// negocios y notas escritas a mano. Sin base: tablero-core.ts es puro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERTAS_CRITICAS } from "@/lib/cockpit/plan";
import { NEON_EN_PAUSA, estadoDeTenant, saludComponentes, type SnapshotNeon } from "@/lib/cockpit/salud";
import { estadoGeneral, lecturaDeBase, llavesDeServicios, notasAMano, resumenDeNegocios } from "./tablero-core";

const LAB = saludComponentes({ dbOk: true, rlsEnforced: true, modoArca: "stub", modoMp: "stub", whatsappVivo: false });
const REAL = saludComponentes({ dbOk: true, rlsEnforced: true, modoArca: "real", modoMp: "real", whatsappVivo: true });

test("en el laboratorio: sistema, base y aislamiento arriba; facturación, cobros y WhatsApp al medio", () => {
  const llaves = llavesDeServicios(LAB, { arca: "stub", cobros: "stub" });
  assert.deepEqual(
    llaves.map((l) => [l.nombre, l.posicion, l.estado]),
    [
      ["Sistema", "arriba", "En línea"],
      ["Base de datos", "arriba", "Anda"],
      ["Aislamiento", "arriba", "Prendido"],
      ["Facturación", "medio", "En prueba"],
      ["Cobros", "medio", "En prueba"],
      ["WhatsApp", "medio", "Sin conectar"],
    ],
  );
});

test("ninguna llave usa siglas internas ni variables de entorno", () => {
  const todas = [
    ...llavesDeServicios(LAB, { arca: "stub", cobros: "stub" }),
    ...llavesDeServicios(REAL, { arca: "real", cobros: "real" }),
    ...llavesDeServicios(
      saludComponentes({ dbOk: false, rlsEnforced: false, modoArca: "homologacion", modoMp: "test", whatsappVivo: false }),
      { arca: "homologacion", cobros: "test" },
    ),
  ];
  for (const l of todas) {
    assert.doesNotMatch(`${l.nombre} ${l.estado} ${l.dice}`, /RLS|Enforced|sandbox|Neon|[A-Z]{3,}_[A-Z]/);
  }
});

test("facturación en el ambiente de prueba de ARCA avisa que nada tiene validez fiscal", () => {
  const arca = llavesDeServicios(
    saludComponentes({ dbOk: true, rlsEnforced: true, modoArca: "homologacion", modoMp: "stub", whatsappVivo: false }),
    { arca: "homologacion", cobros: "stub" },
  ).find((l) => l.id === "arca");
  assert.match(arca?.dice ?? "", /ninguna factura tiene validez fiscal/);
});

test("con todo en real, anda todo", () => {
  const llaves = llavesDeServicios(REAL, { arca: "real", cobros: "real" });
  const g = estadoGeneral(llaves, lecturaDeBase(NEON_EN_PAUSA));
  assert.equal(g.frase, "Anda todo");
  assert.deepEqual(g.paraMirar, []);
});

test("en el laboratorio anda, con facturación, cobros y WhatsApp para mirar", () => {
  const g = estadoGeneral(llavesDeServicios(LAB, { arca: "stub", cobros: "stub" }), lecturaDeBase(NEON_EN_PAUSA));
  assert.equal(g.frase, "Anda, con cosas para mirar");
  assert.deepEqual(g.paraMirar, ["Facturación", "Cobros", "WhatsApp"]);
});

test("si la base no responde, hay algo caído y va primero", () => {
  const caida = saludComponentes({ dbOk: false, rlsEnforced: true, modoArca: "stub", modoMp: "stub", whatsappVivo: false });
  const g = estadoGeneral(llavesDeServicios(caida, { arca: "stub", cobros: "stub" }), lecturaDeBase(NEON_EN_PAUSA));
  assert.equal(g.frase, "Hay algo caído");
  assert.deepEqual(g.paraMirar, ["Base de datos"]);
});

test("la medición en pausa no inventa números", () => {
  const b = lecturaDeBase(NEON_EN_PAUSA);
  assert.equal(b.numeros, null);
  assert.equal(b.estado, "Medición apagada");
});

test("la medición prendida muestra los tres números de la última lectura", () => {
  const neon: SnapshotNeon = { estado: "atencion", conexiones: 12, latenciaMs: 1234, locks: 0, nota: "" };
  const b = lecturaDeBase(neon);
  assert.equal(b.estado, "Lenta");
  assert.deepEqual(b.numeros?.map((x) => x.valor), ["1.234 ms", "12", "0"]);
  const g = estadoGeneral(llavesDeServicios(REAL, { arca: "real", cobros: "real" }), b);
  assert.deepEqual(g.paraMirar, ["Base de datos"]);
});

test("un negocio en prueba no es un problema de la plataforma; uno suspendido sí", () => {
  const r = resumenDeNegocios([
    estadoDeTenant({ id: "1", name: "CH Estética", slug: "beauty-spa", status: "ACTIVE", subdomain: "chestetica" }),
    estadoDeTenant({ id: "2", name: "MAGRA", slug: "magra", status: "TRIAL", subdomain: null }),
    estadoDeTenant({ id: "3", name: "Viejo", slug: "viejo", status: "SUSPENDED", subdomain: "viejo" }),
  ]);
  assert.deepEqual([r.total, r.produccion, r.prueba, r.suspendidos], [3, 1, 1, 1]);
  assert.deepEqual(r.conProblema.map((p) => p.nombre), ["Viejo"]);
});

test("las notas escritas a mano salen sin siglas y con la urgente primero", () => {
  const notas = notasAMano(ALERTAS_CRITICAS);
  assert.equal(notas.length, ALERTAS_CRITICAS.length);
  assert.equal(notas[0].urgente, true);
  for (const n of notas) {
    assert.doesNotMatch(`${n.titulo} ${n.detalle} ${n.queHacesVos}`, /PITR|NEON_API_KEY|Gate \d|T3|sandbox|tenant|deploy/i);
  }
});

test("una nota nueva que no conozco se muestra con sus palabras de origen", () => {
  const [n] = notasAMano([{ id: "otra", severidad: "amarilla", titulo: "Algo nuevo", detalle: "d", accionDueno: "a" }]);
  assert.deepEqual([n.titulo, n.detalle, n.queHacesVos, n.urgente], ["Algo nuevo", "d", "a", false]);
});
