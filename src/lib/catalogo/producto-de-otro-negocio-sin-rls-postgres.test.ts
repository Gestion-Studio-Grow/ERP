// ============================================================================
// UAT MAGRA 16/10 · Activar y borrar un producto: el negocio A no toca los de B, AUNQUE RLS
// esté apagado (defensa en profundidad).
// ============================================================================
//
// `toggleProductActive` y `deleteProduct` (catalog-actions.ts) escribían con `where: { id }`:
// lo único que impedía que el dueño de A apagara o borrara un producto de B mandando su id era
// RLS. Acá la app corre con el rol dueño de las tablas y `RLS_ENFORCEMENT=off`, así que la base
// no filtra nada: si el `where` no lleva el negocio, el producto de B cambia. Archivo aparte del
// de RLS prendido porque el cliente de Prisma se elige al importar (lib/db.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { probarProductoDeOtroNegocio } from "./producto-de-otro-negocio";

const laBase = baseEfimeraDelArchivo();

test("sin RLS: el negocio A no puede activar, desactivar ni borrar un producto del negocio B", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    DATABASE_URL: base.urlDuenio, // el rol dueño: la base no filtra nada por negocio
    RLS_ENFORCEMENT: "off",
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
  });
  prepararAccionesDeServidor();
  const { RLS_ENFORCEMENT } = await import("@/lib/prisma-base");
  assert.equal(RLS_ENFORCEMENT, false, "la app corre sin RLS");
  await probarProductoDeOtroNegocio(base, await prismaComoDuenio(base), ejecutarAccion);
});
