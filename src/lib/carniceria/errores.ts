// ============================================================================
// ¿POR QUÉ FALLÓ UNA CONSULTA CRUDA DE LOTES O DESPIECE? — PURO.
// ============================================================================
//
// Lotes y Despiece escriben con SQL crudo (sus tablas no están en el cliente de Prisma hasta
// la migración cárnica). Hasta la ola 3 TODO error se tragaba con un `catch {}`: la tabla que
// no existe, un número de lote repetido o una caída de la base terminaban igual, en silencio,
// y la persona veía el formulario vacío como si se hubiera guardado. Acá se distingue:
//   · "sin-migracion": la tabla o la columna no existe (42P01 / 42703). Es lo esperado antes
//     de la migración: la pantalla dice "En preparación", no es un error de nadie;
//   · "duplicado": violó un índice único (23505), p. ej. el número de lote ya usado;
//   · "otro": cualquier otra cosa. Se loguea y se le dice a la persona que no se guardó.
//
// Con Prisma 7 y el adaptador de pg, el SQLSTATE de una consulta cruda NO viene en `code`
// (que es "P2010"): viaja en `meta.driverAdapterError.cause.originalCode` y en el mensaje
// ("Code: `23505`"). Medido en la integración de la ola 2 (conflicto-de-escritura.ts y
// must-change-password.ts cuentan lo mismo). Se miran las tres formas.

export type MotivoDelError = "sin-migracion" | "duplicado" | "otro";

function sqlstate(e: unknown): string | null {
  if (!e || typeof e !== "object") return null;
  const x = e as { code?: unknown; message?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } } } };
  // `code` es el SQLSTATE sólo con el driver directo; con Prisma es su propio código (P2010).
  if (typeof x.code === "string" && /^[0-9A-Z]{5}$/.test(x.code) && !/^P[1-9]\d{3}$/.test(x.code)) return x.code;
  const causa = x.meta?.driverAdapterError?.cause;
  if (typeof causa?.originalCode === "string") return causa.originalCode;
  if (causa?.kind === "TableDoesNotExist") return "42P01";
  if (causa?.kind === "ColumnNotFound") return "42703";
  if (causa?.kind === "UniqueConstraintViolation") return "23505";
  const m = typeof x.message === "string" ? /Code: `([0-9A-Z]{5})`/.exec(x.message) : null;
  return m ? m[1] : null;
}

/** Qué pasó con una consulta cruda que falló. PURA. */
export function motivoDelError(e: unknown): MotivoDelError {
  const s = sqlstate(e);
  if (s === "42P01" || s === "42703") return "sin-migracion";
  if (s === "23505") return "duplicado";
  return "otro";
}
