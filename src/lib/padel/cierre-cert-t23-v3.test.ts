// ============================================================================
// CIERRE DE LA CERT MATÍAS T2+T3 — VUELTA 3: las tres observaciones menores.
// ============================================================================
//   O-3d la nota «tu comprobante no hizo falta» se ve en el historial del alumno (antes quedaba en
//        `pagoNota` y sólo se mostraba en «Pagar», donde esa clase nunca aparece).
//   O-16b un choque agotado en una acción que NO es de horario (cobrar, devolver el saldo, editar un
//        alumno, validar un comprobante, subir el comprobante) dice «Otra persona cambió esto recién»,
//        no «Elegí otro horario».
//   O-9c `guardarHorarios(FormData)` ya no es una acción exportada.
//
//   node --import tsx --test src/lib/padel/cierre-cert-t23-v3.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { COMPROBANTE_NO_APLICA, MOTIVO_AUSENTE_NO_SE_COBRA, MOTIVO_AUSENTE_SE_COBRA } from "./core";
import { COMPROBANTE_NO_HIZO_FALTA, etiquetaPago, notaDeLaClase } from "@/app/alumno/_vista/estado";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const fuente = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

/** El cuerpo de `export async function <nombre>(` hasta la próxima función exportada. */
function cuerpoDe(src: string, nombre: string): string {
  const i = src.indexOf(`export async function ${nombre}(`);
  assert.ok(i >= 0, `no encontré ${nombre}`);
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}

test("O-3d: la clase con el comprobante que no hizo falta muestra la nota; las demás, no", () => {
  assert.equal(notaDeLaClase({ pagoNota: COMPROBANTE_NO_APLICA }), COMPROBANTE_NO_HIZO_FALTA);
  assert.match(COMPROBANTE_NO_HIZO_FALTA, /^Tu comprobante no hizo falta: esa clase no se cobra/);
  assert.equal(notaDeLaClase({ pagoNota: null }), null);
  assert.equal(notaDeLaClase({ pagoNota: "El monto no coincide con el de la clase." }), null, "la nota de un comprobante devuelto va en «Pagar», no acá");
});

test("O-3d: «No vino · no se cobra» dice «No se cobra», no «Sin pagar» (que parece deuda)", () => {
  const base = { pagoMedio: null, precio: 25_000 };
  assert.equal(etiquetaPago({ ...base, pagoEstado: "PENDIENTE", estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_NO_SE_COBRA }), "No se cobra");
  assert.equal(etiquetaPago({ ...base, pagoEstado: "PENDIENTE", estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_SE_COBRA }), "Sin pagar", "si se cobra igual, es deuda");
  assert.equal(etiquetaPago({ ...base, pagoEstado: "ACREDITADO", estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_NO_SE_COBRA }), "Quedó a favor");
  assert.equal(etiquetaPago({ ...base, pagoEstado: "PENDIENTE" }), "Sin pagar", "sin estado, como antes");
});

test("O-3d: el historial del alumno pinta la nota y se abre solo si hay una", () => {
  const vista = fuente("src/app/alumno/_vista/VistaAlumno.tsx");
  assert.match(vista, /notaDeLaClase\(c\)/);
  assert.match(vista, /data-qa="nota-clase"/);
  assert.match(vista, /open=\{historial\.some\(\(c\) => notaDeLaClase\(c\)\) \|\| undefined\}/);
});

test("O-16b: un choque agotado dice «Otra persona cambió esto recién» si se pide; por defecto sigue el de horario", async () => {
  prepararAccionesDeServidor();
  const { respuestaDeError, conErrorNegocio, OTRA_PERSONA_CAMBIO, SE_OCUPO_A_LA_VEZ } = await import("./acciones-compartido");
  const crudo = Object.assign(new Error("TransactionWriteConflict"), { name: "DriverAdapterError", cause: { originalCode: "40001", kind: "TransactionWriteConflict" } });
  assert.equal(OTRA_PERSONA_CAMBIO, "Otra persona cambió esto recién. Probá de nuevo.");
  assert.deepEqual(respuestaDeError(crudo, OTRA_PERSONA_CAMBIO), { ok: false, error: OTRA_PERSONA_CAMBIO });
  assert.deepEqual(respuestaDeError(crudo), { ok: false, error: SE_OCUPO_A_LA_VEZ });
  assert.deepEqual(await conErrorNegocio(async () => { throw crudo; }, OTRA_PERSONA_CAMBIO), { ok: false, error: OTRA_PERSONA_CAMBIO });
  assert.deepEqual(await conErrorNegocio(async () => { throw crudo; }), { ok: false, error: SE_OCUPO_A_LA_VEZ });
  await assert.rejects(conErrorNegocio(async () => { throw new Error("connect ECONNREFUSED"); }, OTRA_PERSONA_CAMBIO), /ECONNREFUSED/, "un corte sigue subiendo");
});

test("O-16b: las acciones de plata y de datos usan el texto neutro; las de horario, el de horario", () => {
  const profe = fuente("src/lib/padel/acciones.ts");
  for (const f of ["cobrar", "cobrarTodo", "editarAlumno", "devolverSaldo"]) {
    assert.match(cuerpoDe(profe, f), /OTRA_PERSONA_CAMBIO/, `${f} tiene que decir «Otra persona cambió esto recién»`);
  }
  // validar / devolver un comprobante pasan por cambiarPago.
  const iPago = profe.indexOf("async function cambiarPago(");
  assert.match(profe.slice(iPago, profe.indexOf("\nexport ", iPago)), /OTRA_PERSONA_CAMBIO/);
  for (const f of ["moverHorario", "cancelarConMotivo"]) assert.doesNotMatch(cuerpoDe(profe, f), /OTRA_PERSONA_CAMBIO/, `${f} es de horario`);
  const alumno = fuente("src/lib/padel/acciones-alumno.ts");
  assert.match(cuerpoDe(alumno, "subirComprobanteVarias"), /OTRA_PERSONA_CAMBIO/);
});

test("O-9c: `guardarHorarios(FormData)` ya no es una acción exportada (y nadie la importa)", async () => {
  prepararAccionesDeServidor();
  const profe = await import("./acciones");
  assert.equal("guardarHorarios" in profe, false);
  assert.doesNotMatch(fuente("src/lib/padel/acciones.ts"), /export async function guardarHorarios/);
});
