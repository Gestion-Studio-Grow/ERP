// ============================================================================
// ¿LA TRANSACCIÓN ABORTÓ POR OTRA CONCURRENTE? — la señal para reintentarla.
// ============================================================================
//
// Postgres aborta una transacción con `serialization_failure` (SQLSTATE 40001, en Serializable)
// o con `deadlock_detected` (40P01). No es un error de negocio: re-correr la transacción entera
// la resuelve. Prisma lo informa de DOS formas según dónde salte:
//   · en una operación de modelo: P2034 ("Transaction failed due to a write conflict or a
//     deadlock");
//   · en una consulta cruda ($executeRaw/$queryRaw): P2010 ("Raw query failed"), con el
//     SQLSTATE en el mensaje y en `meta.driverAdapterError.cause.originalCode`.
// Medido contra el Postgres local con el adaptador pg y Prisma 7.8 (integración de la ola 2):
//   40001 → code P2010, meta.driverAdapterError.cause = { originalCode: "40001",
//           kind: "TransactionWriteConflict" }, mensaje "…Raw query failed. Code: `40001`…";
//   40P01 → code P2010, meta.driverAdapterError.cause.originalCode "40P01", mensaje
//           "…Raw query failed. Code: `40P01`. Message: `deadlock detected`".
// Antes sólo se reconocía P2034, así que ninguna transacción Serializable que chocaba en una
// consulta cruda se reintentaba.
//
// Y una TERCERA forma, sin envoltorio de Prisma (CERT Matías T2+T3, F-1, 2026-10-22): cuando el
// abort salta en el `$executeRaw` del GUC o en el COMMIT del transaction-manager, el adaptador pg
// tira su `DriverAdapterError` CRUDO — `name: "DriverAdapterError"`, sin `code`, con
// `cause = { originalCode: "40001", kind: "TransactionWriteConflict", originalMessage }`
// (`@prisma/driver-adapter-utils` + `convertDriverError` de `@prisma/adapter-pg`). No es un
// `PrismaClientKnownRequestError`, así que el `instanceof` de `rls.ts` lo dejaba pasar sin
// reintentar: 1 de cada ~24 movidas simultáneas al mismo hueco terminaba en un 500 en vez de
// «Se ocupó recién». Se reconoce por FORMA (nombre + causa), igual que `isDriverAdapterError`
// de Prisma, para no importar valores de Prisma acá.
//
// PURA y sin importar valores de Prisma: mira el `code` del error, como hace cualquier llamador
// que no quiera arrastrar el cliente (y así se prueba en node con errores armados a mano).

const SQLSTATE_DE_CONFLICTO = new Set(["40001", "40P01"]);

function sqlstateDeConsultaCruda(e: Error): string | null {
  const meta = (e as { meta?: unknown }).meta;
  const causa =
    meta && typeof meta === "object"
      ? (meta as { driverAdapterError?: { cause?: { originalCode?: unknown } } }).driverAdapterError?.cause
      : undefined;
  if (typeof causa?.originalCode === "string") return causa.originalCode;
  const m = /Code: `([0-9A-Z]{5})`/.exec(e.message);
  return m ? m[1] : null;
}

type CausaDelAdaptador = { originalCode?: unknown; kind?: unknown };

/** La causa de un `DriverAdapterError` crudo (por forma), o null si `e` no lo es. */
function causaDelAdaptador(e: unknown): CausaDelAdaptador | null {
  if (!e || typeof e !== "object") return null;
  const x = e as { name?: unknown; cause?: unknown };
  if (x.name !== "DriverAdapterError" || !x.cause || typeof x.cause !== "object") return null;
  return x.cause as CausaDelAdaptador;
}

function esCausaDeConflicto(c: CausaDelAdaptador): boolean {
  return c.kind === "TransactionWriteConflict" || (typeof c.originalCode === "string" && SQLSTATE_DE_CONFLICTO.has(c.originalCode));
}

/**
 * ¿Conflicto de escritura o deadlock? Acepta las tres formas en que llega con Prisma 7 + el
 * adaptador pg: P2034 (operación de modelo), P2010 con 40001/40P01 (consulta cruda) y el
 * `DriverAdapterError` crudo con `kind: "TransactionWriteConflict"` o SQLSTATE 40001/40P01
 * (también si viene como `cause` de otro error). Lo demás, no.
 */
export function esConflictoDeEscritura(e: unknown): boolean {
  const delAdaptador = causaDelAdaptador(e) ?? causaDelAdaptador((e as { cause?: unknown } | null)?.cause);
  if (delAdaptador) return esCausaDeConflicto(delAdaptador);
  if (!(e instanceof Error)) return false;
  const code = (e as { code?: unknown }).code;
  if (code === "P2034") return true;
  if (code !== "P2010") return false;
  const sqlstate = sqlstateDeConsultaCruda(e);
  return sqlstate !== null && SQLSTATE_DE_CONFLICTO.has(sqlstate);
}
