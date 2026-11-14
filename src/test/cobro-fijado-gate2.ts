// D13 (cobro fijado) es Gate 2: sus columnas no vienen con `prisma migrate deploy`. Los tests que las necesitan aplican
// `prisma/pending-gate2/D13_cobro_fijado.sql` como dueño en su base efímera (mismo patrón que `N2_hub.sql` en
// src/eventos/emitir-postgres.test.ts) y leen las columnas con SQL crudo (el cliente de Prisma no las conoce).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import type { BaseEfimera } from "./base-efimera";

export const ARCHIVO_D13 = path.join(process.cwd(), "prisma", "pending-gate2", "D13_cobro_fijado.sql");

/** Corre SQL como dueño con psql (ON_ERROR_STOP): el archivo entero, con su BEGIN/COMMIT y sus bloques `DO`. */
export function correrComoDuenio(base: BaseEfimera, sql: string): void {
  execFileSync("psql", [base.urlDuenio, "-v", "ON_ERROR_STOP=1", "-q", "-X"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
}

/** Aplica el SQL pendiente de D13. */
export function aplicarD13(base: BaseEfimera): void {
  correrComoDuenio(base, readFileSync(ARCHIVO_D13, "utf8"));
}

/** La vuelta atrás que el archivo trae comentada al pie (desde `-- VUELTA ATRÁS`), sin el `-- ` de cada línea. */
export function vueltaAtrasD13(): string {
  const texto = readFileSync(ARCHIVO_D13, "utf8");
  const desde = texto.indexOf("\n-- VUELTA ATRÁS");
  if (desde < 0) throw new Error("D13_cobro_fijado.sql no trae la vuelta atrás");
  return texto
    .slice(desde + 1)
    .split("\n")
    .slice(1)
    .filter((l) => l.startsWith("--   "))
    .map((l) => l.slice(5))
    .join("\n");
}

export type FilaFijada = { cuotaId: string | null; moneda: string | null; centavos: string | null; tipoCambio: string | null };

/** Las cuatro columnas D13 de un cobro, como texto exacto. */
export async function fijadoDe(db: PrismaClient, id: string): Promise<FilaFijada> {
  const filas = await db.$queryRaw<FilaFijada[]>`
    SELECT "cuotaId", "moneda", "montoMonedaCentavos"::text AS centavos, "tipoCambio"::text AS "tipoCambio" FROM "ProyectoPago" WHERE "id" = ${id}`;
  if (filas.length !== 1) throw new Error(`no está el cobro ${id}`);
  return filas[0];
}
