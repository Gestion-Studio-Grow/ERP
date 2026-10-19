// UAT 16/10 (B7): en producción las acciones públicas que tiraban mostraban un genérico en
// inglés. Este núcleo decide el texto en castellano que ve la clienta.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { RechazoDeDominio } from "./rechazo-de-dominio";
import { HORARIO_TOMADO_EN_CARRERA, mensajeParaLaClienta } from "./reserva-publica-mensaje";

const GENERICO = "No pudimos confirmar tu turno. Probá de nuevo en un rato.";

function sinLog<T>(fn: () => T): { valor: T; logs: number } {
  const espia = mock.method(console, "error", () => {});
  try {
    const valor = fn();
    return { valor, logs: espia.mock.callCount() };
  } finally {
    espia.mock.restore();
  }
}

test("un rechazo de dominio se muestra tal cual", () => {
  const r = sinLog(() => mensajeParaLaClienta(new RechazoDeDominio("Ese horario ya pasó. Elegí otro."), GENERICO, "t"));
  assert.deepEqual(r, { valor: "Ese horario ya pasó. Elegí otro.", logs: 0 });
});

test("la carrera perdida (P2034, o P2010 con 40001) dice que el horario se ocupó", () => {
  const p2034 = new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict", {
    code: "P2034",
    clientVersion: "x",
  });
  const p2010 = new Prisma.PrismaClientKnownRequestError("Raw query failed. Code: `40001`. Message: could not serialize", {
    code: "P2010",
    clientVersion: "x",
  });
  for (const e of [p2034, p2010]) {
    assert.deepEqual(sinLog(() => mensajeParaLaClienta(e, GENERICO, "t")), { valor: HORARIO_TOMADO_EN_CARRERA, logs: 0 });
  }
});

test("lo demás (base caída, bug, Error suelto en inglés) muestra el genérico y va al log", () => {
  for (const e of [new TypeError("Cannot read properties of undefined"), new Error("Can't reach database server")]) {
    assert.deepEqual(sinLog(() => mensajeParaLaClienta(e, GENERICO, "t")), { valor: GENERICO, logs: 1 });
  }
});
