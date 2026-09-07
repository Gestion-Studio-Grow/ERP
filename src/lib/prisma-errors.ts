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

// De dónde sacar QUÉ índice se violó en un P2002.
//
// Con el motor clásico venía en `meta.target`, como nombre de constraint (string, típico
// en Postgres: `Modelo_campoA_campoB_key`) o como lista de campos. Con los DRIVER ADAPTERS
// de Prisma 7 (PrismaPg, el que usa este repo) `meta.target` es **undefined** y el dato
// viaja anidado en `meta.driverAdapterError.cause`. Medido contra Postgres local:
//
//   meta = { modelName: "User", driverAdapterError: { cause: {
//     originalCode: "23505",
//     originalMessage: 'duplicate key value violates unique constraint "User_tenantId_email_key"',
//     constraint: { fields: ['"tenantId"', "email"] } } } }
//
// Es el MISMO problema que tenía `isColumnMissing` con el P2022, en su función hermana.
// Sin este arreglo, todo `isUniqueViolation(e, "campo")` daba false en producción y las
// guardas de idempotencia que dependen de él —la carrera del doble submit en el cobro de
// turno, en la venta del mostrador y en la `idempotencyKey` del pedido— nunca se
// activaban: en vez de resolverse en silencio, la colisión salía como error 500.
//
// OJO: acá NO sirve el fallback por `e.message` que usa `isColumnMissing`, porque el
// mensaje de un P2002 es el volcado de la invocación y no nombra el campo.
function p2002Target(e: Prisma.PrismaClientKnownRequestError): string {
  const meta = e.meta as
    | {
        target?: unknown;
        driverAdapterError?: { cause?: { constraint?: { fields?: unknown; index?: unknown }; originalMessage?: unknown } };
      }
    | undefined;

  const partes: string[] = [];

  const t = meta?.target;
  if (t !== undefined) partes.push(Array.isArray(t) ? t.join(",") : String(t));

  const causa = meta?.driverAdapterError?.cause;
  const fields = causa?.constraint?.fields;
  // Los nombres pueden venir citados (`"tenantId"`): se limpian las comillas.
  if (Array.isArray(fields)) partes.push(fields.map((f) => String(f).replace(/"/g, "")).join(","));
  if (causa?.constraint?.index !== undefined) partes.push(String(causa.constraint.index));
  if (causa?.originalMessage !== undefined) partes.push(String(causa.originalMessage));

  return partes.join(",").toLowerCase();
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
  // Con el motor clásico el P2022 trae `meta.column` ("Modelo.columna"). Con los DRIVER
  // ADAPTERS de Prisma 7 (PrismaPg, el que usa este repo) `meta` trae `modelName` y
  // `driverAdapterError: ColumnNotFound` pero NO `column` — medido contra Postgres local con
  // la columna `CashMovement.paymentId` sin migrar. La columna sí viaja en el mensaje
  // ("The column `CashMovement.paymentId` does not exist in the current database."), así que
  // se busca en los dos lugares. Sin este fallback, todo `isColumnMissing(e, "x")` daba false
  // en producción y la tolerancia a schema-ahead (A-1, cobro de turno) no se activaba nunca.
  const col = (e.meta as { column?: unknown } | undefined)?.column;
  const needle = column.toLowerCase();
  if (String(col ?? "").toLowerCase().includes(needle)) return true;
  return String(e.message ?? "").toLowerCase().includes(needle);
}
