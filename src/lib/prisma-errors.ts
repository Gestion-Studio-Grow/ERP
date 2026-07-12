// ============================================================================
// Helpers de errores conocidos de Prisma — clasificación por código.
// ============================================================================
//
// Centraliza el reconocimiento de errores de Prisma que el código de negocio trata
// como CONDICIONES (no como fallos opacos): colisión de índice único (P2002) y
// columna inexistente (P2022, el síntoma de "la migración todavía no se aplicó" =
// schema-ahead). Se usa en los fixes de concurrencia/idempotencia (A-1/A-2/A-5/A-6)
// para: reintentar una colisión de correlativo, devolver el ganador de una carrera de
// idempotencia, y DEGRADAR con gracia cuando un índice/columna aún no existe en la DB
// (main auto-deploya ANTES de migrar — el código debe tolerarlo).

import { Prisma } from "@/generated/prisma/client";

/** ¿Es un `PrismaClientKnownRequestError` con este código? */
export function isPrismaError(e: unknown, code: string): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;
}

// El `target` de un P2002 puede venir como nombre de constraint (string, típico en
// Postgres: `Modelo_campoA_campoB_key`) o como lista de campos. Se normaliza a un
// string en minúsculas para poder buscar un campo por substring de forma robusta.
function p2002Target(e: Prisma.PrismaClientKnownRequestError): string {
  const t = (e.meta as { target?: unknown } | undefined)?.target;
  return (Array.isArray(t) ? t.join(",") : String(t ?? "")).toLowerCase();
}

/**
 * Violación de índice único (P2002). Si se pasa `field`, además exige que el índice
 * involucrado mencione ese campo (por nombre de constraint o lista de campos) — así se
 * distingue, p. ej., la colisión del correlativo `code` de la de la clave de idempotencia.
 */
export function isUniqueViolation(e: unknown, field?: string): boolean {
  if (!isPrismaError(e, "P2002")) return false;
  if (!field) return true;
  return p2002Target(e).includes(field.toLowerCase());
}

/**
 * Columna inexistente (P2022): la migración que la agrega TODAVÍA no se aplicó a la DB
 * (schema-ahead). El código que escribe una columna nueva captura esto y cae al camino
 * viejo (sin esa columna), para no romper prod entre el deploy de `main` y el `migrate
 * deploy` (Gate 2). Si se pasa `column`, exige que el error sea de esa columna.
 */
export function isColumnMissing(e: unknown, column?: string): boolean {
  if (!isPrismaError(e, "P2022")) return false;
  if (!column) return true;
  const col = (e.meta as { column?: unknown } | undefined)?.column;
  return String(col ?? "").toLowerCase().includes(column.toLowerCase());
}
