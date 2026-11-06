// Tolerancia a la migración ausente: si la tabla no existe (Prisma P2021) o falta una columna
// (P2022), el repo devuelve MIGRACION_PENDIENTE en vez de un 500. Sin base: se simula el error
// reemplazando `basePrisma.$transaction` con un mock (el cliente de Prisma es un proxy: se le
// define la propiedad propia y se borra al terminar).

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://nadie@127.0.0.1:1/nada";

/** Reemplaza `basePrisma.$transaction` por `falso` y devuelve cuántas veces se llamó + cómo restaurar. */
async function simularTransaccion(falso: () => Promise<never>) {
  const { basePrisma } = await import("@/lib/prisma-base");
  let llamadas = 0;
  Object.defineProperty(basePrisma, "$transaction", {
    configurable: true,
    writable: true,
    value: async () => {
      llamadas++;
      return falso();
    },
  });
  return {
    llamadas: () => llamadas,
    restaurar: () => {
      delete (basePrisma as unknown as Record<string, unknown>).$transaction;
    },
  };
}

for (const code of ["P2021", "P2022"]) {
  test(`${code} → MIGRACION_PENDIENTE`, async () => {
    const repo = await import("./repo");
    const falla = Object.assign(new Error("The table `public.Asiento` does not exist in the current database."), { code });
    const m = await simularTransaccion(async () => {
      throw falla;
    });
    try {
      const r = await repo.confirmarAsiento("negocio-x", "asiento-x");
      assert.equal(r.ok, false);
      assert.equal(r.ok ? "" : r.error, "MIGRACION_PENDIENTE");
      assert.equal(r.ok ? "" : r.mensaje, repo.MENSAJE_MIGRACION_PENDIENTE);
      const a = await repo.anularAsiento("negocio-x", "asiento-x");
      assert.equal(a.ok ? "" : a.error, "MIGRACION_PENDIENTE");
      assert.ok(m.llamadas() >= 2);
    } finally {
      m.restaurar();
    }
  });
}

test("otro error no se disfraza de migración pendiente", async () => {
  const repo = await import("./repo");
  const m = await simularTransaccion(async () => {
    throw Object.assign(new Error("boom"), { code: "P1001" });
  });
  try {
    await assert.rejects(repo.confirmarAsiento("negocio-x", "asiento-x"), /boom/);
  } finally {
    m.restaurar();
  }
});
