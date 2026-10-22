// ============================================================================
// PADEL-CLASES · T4 — el puente de schema-ahead: el código anda con Y sin la migración nueva.
// ============================================================================
//
// La migración 20261023120000_padel_reingenieria suma tablas (clubes, series, paquetes, participantes,
// push, espera) y columnas a PadelConfig, PadelDisponibilidad y PadelClase. Producción NO la tiene
// todavía (Gate 2: se aplica sólo con OK del dueño), pero el código se publica antes. Reglas:
//
//  1. Ninguna lectura ni escritura de PadelClase / PadelConfig / PadelDisponibilidad pide el registro
//     entero: SIEMPRE `select` explícito. Prisma con `select` no nombra las columnas nuevas, así que
//     la consulta anda en una base vieja. (Guardia: modelo-t4.test.ts recorre el código.)
//  2. Lo nuevo se pide sólo si `modeloT4()` (modelo.server.ts) dice que la base lo tiene. Una sola
//     consulta a information_schema por proceso (con 60 s de espera para volver a mirar si no está).
//  3. Las acciones nuevas que igual tropiezan con una tabla o columna inexistente (P2021 / P2022)
//     contestan SIN_ACTUALIZACION, nunca un 500.
//
// PURO (sin server-only): lo importan los tests para armar un cliente que no pida las columnas nuevas.

/** Lo que contesta una función nueva en una base sin la migración. */
export const SIN_ACTUALIZACION = "Esta función se habilita cuando se active la actualización de la base.";

/** La migración de la Tanda 4. */
export const MIGRACION_T4 = "20261023120000_padel_reingenieria";

/** Las tablas nuevas de la T4. */
export const TABLAS_T4 = ["PadelClub", "PadelSerie", "PadelPaquete", "PadelPaqueteAlumno", "PadelParticipante", "PadelSuscripcionPush", "PadelEspera"] as const;

/** Las columnas nuevas de tablas que ya existían (las que la regla 1 no deja pedir a ciegas). */
export const COLUMNAS_T4 = {
  padelConfig: ["ausenteSeCobra", "tardiaSeCobra", "confirmarConocidos", "cierreAutoHoras", "recordatorioHora", "trasladoMinDefault"],
  padelDisponibilidad: ["clubId"],
  padelClase: ["clubId", "serieId", "serieFecha", "paqueteAlumnoId", "cupo", "pagado", "seCobra", "nota", "costoCancha"],
} as const;

/**
 * `omit` de Prisma con todas las columnas nuevas: para un cliente de PRUEBA que siembra y mira una
 * base sin la migración (`prismaComoDuenio(base, { omit: OMITIR_COLUMNAS_T4 })`). La app NO lo usa:
 * la app pide con `select` (regla 1).
 */
export const OMITIR_COLUMNAS_T4 = Object.fromEntries(
  Object.entries(COLUMNAS_T4).map(([modelo, cols]) => [modelo, Object.fromEntries(cols.map((c) => [c, true]))]),
) as { [M in keyof typeof COLUMNAS_T4]: { [C in (typeof COLUMNAS_T4)[M][number]]: true } };

/** Los pares (tabla, columna) que tiene que encontrar la sonda para decir «la base está al día». */
export const SONDA_T4: readonly (readonly [string, string])[] = [
  ...TABLAS_T4.map((t) => [t, "tenantId"] as const),
  ["PadelConfig", "ausenteSeCobra"],
  ["PadelConfig", "trasladoMinDefault"],
  ["PadelDisponibilidad", "clubId"],
  ["PadelClase", "pagado"],
  ["PadelClase", "serieFecha"],
  ["PadelClase", "costoCancha"],
];

const NOMBRES_T4 = [...TABLAS_T4, ...new Set(Object.values(COLUMNAS_T4).flat())];

/**
 * ¿El error es «esa tabla o columna de la T4 no existe»? P2021 (tabla) o P2022 (columna) de Prisma
 * (por forma: sin importar el cliente), o el 42P01 / 42703 crudo de Postgres que trae el adaptador.
 * Exige que mencione un nombre de la T4: un P2022 de otra cosa sigue subiendo.
 */
export function faltaModeloT4(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const x = e as { code?: unknown; message?: unknown; meta?: unknown; cause?: unknown };
  const causa = (x.meta as { driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } } } | undefined)?.driverAdapterError?.cause
    ?? (x.cause as { originalCode?: unknown; kind?: unknown } | undefined);
  const codigo = String(x.code ?? "");
  const sql = String(causa?.originalCode ?? "");
  const kind = String(causa?.kind ?? "");
  const esFalta = codigo === "P2021" || codigo === "P2022" || sql === "42P01" || sql === "42703" || kind === "TableDoesNotExist" || kind === "ColumnNotFound";
  if (!esFalta) return false;
  let texto = String(x.message ?? "");
  try {
    texto += JSON.stringify(x.meta ?? {}) + JSON.stringify(x.cause ?? {});
  } catch {
    // meta circular: alcanza con el mensaje
  }
  return NOMBRES_T4.some((n) => texto.includes(n));
}
