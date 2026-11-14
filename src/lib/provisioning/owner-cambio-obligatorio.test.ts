// ============================================================================
// GSG-SEG-013 · hallazgo 1 — «nunca una contraseña provisoria sin cambio obligatorio».
// El alta (ADR-019, `provisionTenant`) crea el OWNER con una contraseña que sale de la consola, del configurador
// o del script de soporte: es PROVISORIA por definición (la conoce otro). Tiene que nacer con
// `mustChangePassword = true`, en la MISMA escritura que la crea (si el flag no se puede escribir, el alta
// entera vuelve atrás: no queda un OWNER con provisoria eterna).
//
// Todos los caminos pasan por acá: consola (adapters.ts → adr019Committer), configurador de Soporte
// (configurador.server.ts) y `scripts/soporte/alta-negocio.mts`.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@/generated/prisma/client";
import { provisionTenant } from "../../../scripts/provision-tenant";

/** Base falsa: el negocio ya existe (no dispara el gate de RLS) y el OWNER no. Anota los `user.create`. */
function baseFalsa() {
  const creados: Array<Record<string, unknown>> = [];
  const modelo = (nombre: string) =>
    new Proxy(
      {},
      {
        get: (_, op) => async (args?: { data?: Record<string, unknown> }) => {
          if (nombre === "user" && op === "create") {
            creados.push({ ...(args?.data ?? {}) });
            return { id: "user-1" };
          }
          if (nombre === "user" && op === "findUnique") return null; // el OWNER no existe todavía
          if (op === "findUnique" || op === "upsert" || op === "create") return { id: `${nombre}-1` };
          if (op === "count") return 0;
          return null;
        },
      },
    );
  const tx = new Proxy({}, { get: (_, m) => (m === "$executeRaw" || m === "$queryRaw" ? async () => 1 : modelo(String(m))) });
  const prisma = { $transaction: async (cb: (t: unknown) => unknown) => cb(tx) } as unknown as PrismaClient;
  return { prisma, creados };
}

test("el OWNER del alta nace con cambio obligatorio (contraseña generada)", async () => {
  const { prisma, creados } = baseFalsa();
  const r = await provisionTenant(prisma, {
    name: "Negocio Prueba",
    slug: "negocio-prueba",
    owner: { name: "Dueña", email: "duena@prueba.test" },
    skipCatalog: true,
  });
  assert.equal(r.ownerCreated, true);
  assert.equal(creados.length, 1);
  assert.equal(creados[0].role, "OWNER");
  assert.equal(creados[0].mustChangePassword, true, "una provisoria sin cambio obligatorio quedaría válida para siempre");
});

test("también con la contraseña elegida por quien da el alta: la conoce otro, es provisoria", async () => {
  const { prisma, creados } = baseFalsa();
  await provisionTenant(prisma, {
    name: "Negocio Prueba",
    slug: "negocio-prueba",
    owner: { name: "Dueña", email: "duena@prueba.test", password: "una-clave-del-operador-123" },
    skipCatalog: true,
  });
  assert.equal(creados[0].mustChangePassword, true);
});
