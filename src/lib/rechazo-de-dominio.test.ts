import { test } from "node:test";
import assert from "node:assert/strict";
import { rechazoDeDominio } from "./rechazo-de-dominio";

const GENERICO = "No se pudo. Probá de nuevo.";

test("el rechazo de dominio se muestra tal cual", () => {
  assert.equal(rechazoDeDominio(new Error("Ese profesional no trabaja en ese horario. Elegí otro."), GENERICO), "Ese profesional no trabaja en ese horario. Elegí otro.");
});

test("un error de Prisma (trae code), uno vacío, uno larguísimo o algo que no es Error: el genérico", () => {
  const prisma = Object.assign(new Error("Invalid `prisma.appointment.findFirstOrThrow()` invocation: No record was found"), { code: "P2025" });
  assert.equal(rechazoDeDominio(prisma, GENERICO), GENERICO);
  assert.equal(rechazoDeDominio(new Error("   "), GENERICO), GENERICO);
  assert.equal(rechazoDeDominio(new Error("x".repeat(301)), GENERICO), GENERICO);
  assert.equal(rechazoDeDominio("texto suelto", GENERICO), GENERICO);
  assert.equal(rechazoDeDominio(null, GENERICO), GENERICO);
});
