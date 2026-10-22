import "server-only";

// ============================================================================
// PADEL-CLASES · T4 — ¿la base tiene la migración 20261023120000_padel_reingenieria?
// ============================================================================
//
// Una consulta a information_schema (no lee datos de ningún negocio) que cuenta los pares
// (tabla, columna) de SONDA_T4. Si están todos → true para siempre en este proceso (una migración no
// se des-aplica). Si no → false, y se vuelve a mirar recién en 60 s: cuando el dueño aplique la
// migración (Gate 2), cada instancia se entera sola en un minuto, sin redeploy.
//
// Va FUERA de las transacciones a propósito: en Postgres, una consulta que falla adentro de una
// transacción la deja abortada. Por eso las acciones preguntan antes y arman su consulta según eso.

import { prisma } from "@/lib/prisma";
import { SONDA_T4, faltaModeloT4 } from "./modelo";

const REINTENTO_MS = 60_000;
let cache: { valor: boolean; hasta: number } | null = null;

/** Para los tests: olvidar lo que se sabía. */
export function olvidarModeloT4(): void {
  cache = null;
}

export async function modeloT4(): Promise<boolean> {
  const ahora = Date.now();
  if (cache && (cache.valor || ahora < cache.hasta)) return cache.valor;
  const tablas = [...new Set(SONDA_T4.map(([t]) => t))];
  try {
    const filas = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY(${tablas})`;
    const hay = new Set(filas.map((f) => `${f.table_name}.${f.column_name}`));
    const valor = SONDA_T4.every(([t, c]) => hay.has(`${t}.${c}`));
    cache = { valor, hasta: ahora + REINTENTO_MS };
    return valor;
  } catch (e) {
    if (!faltaModeloT4(e)) throw e;
    cache = { valor: false, hasta: ahora + REINTENTO_MS };
    return false;
  }
}
