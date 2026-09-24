// Qué ve la recepción cuando reprogramar un turno (o reservar un hueco de la espera) no pudo.
// Sólo el motivo que el código escribió a propósito (`RechazoDeDominio`) se muestra tal cual;
// un error de infraestructura o de programación NUNCA se muestra crudo: el genérico, y el
// detalle al log del servidor. Se fabrican INSTANCIAS REALES de los errores de Prisma (varios
// no traen `code`, que era lo único que miraba la versión anterior).

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Prisma } from "@/generated/prisma/client";
import { RechazoDeDominio, motivoMostrable, rechazoDeDominio } from "./rechazo-de-dominio";
import { assertSlotAvailable, type TxClient } from "./booking-core";

const GENERICO = "No se pudo reprogramar el turno. Probá de nuevo; si sigue, avisá a GSG.";
const SCOPE = "agenda.reprogramar";

/** Corre `rechazoDeDominio` capturando lo que va al log (console.error, una línea JSON). */
function mostrarYLog(e: unknown): { mostrado: string; log: Array<Record<string, unknown>> } {
  const espia = mock.method(console, "error", () => {});
  try {
    const mostrado = rechazoDeDominio(e, GENERICO, SCOPE);
    const log = espia.mock.calls.map((c) => JSON.parse(String(c.arguments[0])) as Record<string, unknown>);
    return { mostrado, log };
  } finally {
    espia.mock.restore();
  }
}

function fechaRota(): RangeError {
  try {
    new Date("no es una fecha").toISOString();
  } catch (e) {
    return e as RangeError;
  }
  throw new Error("toISOString de una fecha inválida tenía que tirar RangeError");
}

test("el rechazo de dominio se muestra tal cual y no ensucia el log", () => {
  const { mostrado, log } = mostrarYLog(new RechazoDeDominio("Ese profesional no trabaja en ese horario. Elegí otro."));
  assert.equal(mostrado, "Ese profesional no trabaja en ese horario. Elegí otro.");
  assert.equal(log.length, 0);
});

const NO_MOSTRABLES: Array<[string, unknown, string]> = [
  [
    "PrismaClientInitializationError (la base no responde; trae errorCode, no code)",
    new Prisma.PrismaClientInitializationError("Can't reach database server at `ep-xxx.neon.tech:5432`", "7.8.0", "P1001"),
    "Can't reach database server",
  ],
  [
    "PrismaClientValidationError (consulta mal armada; sin code)",
    new Prisma.PrismaClientValidationError("Invalid `prisma.appointment.update()` invocation: Argument `startsAt` is missing.", { clientVersion: "7.8.0" }),
    "Invalid `prisma.appointment.update()`",
  ],
  [
    "PrismaClientUnknownRequestError (sin code)",
    new Prisma.PrismaClientUnknownRequestError("Error occurred during query execution: ConnectorError", { clientVersion: "7.8.0" }),
    "ConnectorError",
  ],
  [
    "PrismaClientKnownRequestError (P2025, con code)",
    new Prisma.PrismaClientKnownRequestError("No record was found for a query.", { code: "P2025", clientVersion: "7.8.0" }),
    "No record was found",
  ],
  ["RangeError de una fecha que no se puede leer", fechaRota(), "Invalid time value"],
  ["TypeError de un bug", new TypeError("Cannot read properties of null (reading 'boxId')"), "Cannot read properties of null"],
  [
    "un Error suelto de la infraestructura (el del tenant, por ejemplo)",
    new Error("getCurrentTenantId: no hay tenant resuelto para este request"),
    "getCurrentTenantId",
  ],
];

for (const [nombre, error, detalle] of NO_MOSTRABLES) {
  test(`${nombre}: se muestra el genérico y el detalle va al log`, () => {
    const { mostrado, log } = mostrarYLog(error);
    assert.equal(mostrado, GENERICO);
    assert.ok(!mostrado.includes(detalle), "el texto técnico no llega a la pantalla");
    assert.equal(log.length, 1);
    assert.equal(log[0].level, "error");
    assert.equal(log[0].scope, SCOPE);
    const err = log[0].err as { name?: string; message: string };
    assert.ok(err.message.includes(detalle), `el log conserva el detalle: ${err.message}`);
    assert.equal(err.name, (error as Error).name);
  });
}

test("un rechazo de dominio vacío o larguísimo, un string o null: el genérico (y al log)", () => {
  for (const e of [new RechazoDeDominio("   "), new RechazoDeDominio("x".repeat(301)), "texto suelto", null, undefined]) {
    const { mostrado, log } = mostrarYLog(e);
    assert.equal(mostrado, GENERICO);
    assert.equal(log.length, 1);
  }
  assert.equal(motivoMostrable(new Error("Ese horario ya no está disponible")), null, "un Error común no se muestra aunque suene a dominio");
});

// Las reglas de choque (assertSlotAvailable) las comparten el alta, la reprogramación de la
// agenda y la espera: se EJECUTAN con una transacción falsa para comprobar que su rechazo es
// uno mostrable (si alguien vuelve a `throw new Error`, la recepción vería el genérico).
function txFalso(conflictos: Array<{ professionalId: string; boxId: string }>, bloqueoDeBox: { reason: string } | null = null) {
  return {
    appointment: { findMany: async () => conflictos },
    boxBlock: { findFirst: async () => bloqueoDeBox },
    professionalBlock: { findFirst: async () => null },
    serviceResource: { findMany: async () => [] },
  } as unknown as TxClient;
}
const FRANJA = {
  professionalId: "p1",
  boxId: "b1",
  serviceId: "s1",
  startsAt: new Date("2026-10-01T13:00:00Z"),
  endsAt: new Date("2026-10-01T14:00:00Z"),
};

test("el horario ocupado de la agenda llega a la recepción con su motivo", async () => {
  for (const [tx, esperado] of [
    [txFalso([{ professionalId: "p1", boxId: "otro" }]), "Ese horario ya no está disponible para este profesional. Elegí otro horario."],
    [txFalso([{ professionalId: "otra", boxId: "b1" }]), "El box de este profesional ya está ocupado en ese horario. Elegí otro horario."],
    [txFalso([], { reason: "mantenimiento" }), "El box de este profesional no está disponible en ese horario (mantenimiento). Elegí otro horario."],
  ] as const) {
    const e = await assertSlotAvailable(tx, FRANJA).then(
      () => assert.fail("tenía que rechazar"),
      (err: unknown) => err,
    );
    assert.ok(e instanceof RechazoDeDominio);
    assert.equal(mostrarYLog(e).mostrado, esperado);
  }
  // Franja libre: no rechaza.
  await assertSlotAvailable(txFalso([]), FRANJA);
});

// Los cuerpos de la reprogramación y de la reserva desde la espera sólo RECHAZAN con
// `RechazoDeDominio`: un `throw new Error` ahí sería un motivo que la recepción dejaría de ver.
function cuerpo(archivo: string, firma: string): string {
  const src = readFileSync(new URL(archivo, import.meta.url), "utf8");
  const i = src.indexOf(firma);
  assert.ok(i >= 0, `no se encontró ${firma} en ${archivo}`);
  return src.slice(i, src.indexOf("\n}\n", i));
}

test("reprogramar y reservar desde la espera rechazan sólo con RechazoDeDominio", () => {
  for (const [archivo, firma] of [
    ["./actions.ts", "async function reprogramarTurno("],
    ["./waitlist-actions.ts", "export async function bookFromWaitlist("],
    ["./booking-core.ts", "export async function assertSlotAvailable("],
  ] as const) {
    const c = cuerpo(archivo, firma);
    assert.ok(c.includes("throw new RechazoDeDominio("), `${firma} rechaza con RechazoDeDominio`);
    assert.ok(!/throw new Error\(/.test(c), `${firma} no tira Error común`);
    assert.ok(!/findFirstOrThrow|findUniqueOrThrow/.test(c), `${firma}: un "no existe" es un rechazo con motivo, no un P2025`);
  }
});
