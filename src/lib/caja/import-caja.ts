// Lógica PURA del importador del histórico de caja (scripts/import-caja-historica.ts).
//
// Acá vive todo lo que se puede probar sin base: parseo del CSV consolidado, validación
// y normalización de cada fila, la clave de deduplicación, el plan de inserción
// (multiconjunto CSV − DB) y la agregación por mes/medio/tipo que usa la reconciliación.
// Sin Prisma, sin tenant, sin fechas "de hoy": el script sólo orquesta.
//
// CONTRATO DE ENTRADA (lo produce la consolidación de las planillas):
//   fecha,detalle,tipo,medio,monto,origen_archivo,origen_hoja,origen_fila,confianza,nota
//   fecha YYYY-MM-DD · tipo INGRESO|EGRESO · medio EFECTIVO|MP|TARJETA · monto > 0 con
//   punto decimal · confianza alta|corregido|dudoso.
//
// CLAVE DE IDEMPOTENCIA (por qué esta y no otra):
//   No hay ID de origen: la planilla es una hoja de cálculo, la fila 37 de hoy puede ser
//   la 38 mañana. Lo único estable es el CONTENIDO contable de la fila: fecha contable,
//   tipo, medio, monto (en centavos) y detalle normalizado. Es exactamente la misma
//   tupla con la que la pantalla del libro avisa "posible duplicado"
//   (src/lib/libro-caja-actions.ts, `addLibroEntry`), así importador y UI comparten
//   criterio. Como la planilla SÍ puede tener dos filas legítimamente iguales (dos señas
//   del mismo monto el mismo día), la clave no es única: se compara por MULTICONJUNTO —
//   si el CSV trae 2 y la base tiene 1, se inserta 1. Correr dos veces inserta 0.
//   Trade-off asumido: si después se CORRIGE una fila del CSV (otro monto), la vieja
//   queda y la nueva entra; para eso existe la marca de importación en `createdBy`
//   (`importMarker`) y el `--rollback` del script, que la usa para deshacer.

import { round2 } from "@/lib/round";
import type { CashMethod, CashMovementType } from "@/lib/caja/cash-register";

export const CSV_COLUMNS = [
  "fecha",
  "detalle",
  "tipo",
  "medio",
  "monto",
  "origen_archivo",
  "origen_hoja",
  "origen_fila",
  "confianza",
  "nota",
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

export const IMPORT_TYPES = ["INGRESO", "EGRESO"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];
export const IMPORT_METHODS = ["EFECTIVO", "MP", "TARJETA"] as const;
export const CONFIANZA = ["alta", "corregido", "dudoso"] as const;
export type Confianza = (typeof CONFIANZA)[number];

// Una fila del CSV ya validada y normalizada. `line` es el número de línea físico del
// archivo (1 = encabezado) para que cualquier rechazo o rastro apunte a algo que el
// operador pueda abrir y mirar.
export type ImportRow = {
  line: number;
  fecha: string; // YYYY-MM-DD (fecha CONTABLE, hora de pared del negocio)
  detail: string; // normalizado: trim + espacios colapsados
  type: ImportType;
  method: CashMethod;
  cents: number; // entero > 0
  amount: number; // cents / 100, ya round2 — lo que se guarda en `CashMovement.amount`
  confianza: Confianza;
  origen: { archivo: string; hoja: string; fila: string };
  nota: string;
};

export type RejectedRow = { line: number; reason: string; raw: string[] };

// ── CSV (RFC 4180): comillas, comillas escapadas "", comas y saltos de línea dentro de
// comillas, CRLF, BOM. Sin dependencia externa: el formato es chico y controlado.
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (inQuotes) throw new Error("CSV mal formado: comilla sin cerrar al final del archivo");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Detalle normalizado: es lo que se guarda en `reason` y lo que entra en la clave. Sólo
// se colapsa espacio en blanco; mayúsculas, tildes y ñ se respetan tal cual (son parte
// del detalle que el negocio va a leer en pantalla).
export function normalizeDetail(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// "1234.5" → 123450. Rechaza coma decimal, signos, más de 2 decimales y todo lo que no
// sea un número simple: un monto raro tiene que frenar la fila, nunca "interpretarse".
export function parseCents(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  const cents = Number(int) * 100 + Number((dec + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// Parsea + valida el CSV completo. Una fila inválida no frena el resto: va a `rejected`
// con motivo y línea, y el script decide (por flag) si eso aborta la importación.
export function parseCajaCsv(text: string): { rows: ImportRow[]; rejected: RejectedRow[] } {
  const all = parseCsv(text);
  if (all.length === 0) throw new Error("CSV vacío");
  const header = all[0].map((h) => h.trim());
  const idx = new Map<CsvColumn, number>();
  for (const col of CSV_COLUMNS) {
    const at = header.indexOf(col);
    if (at < 0) throw new Error(`CSV sin la columna obligatoria "${col}" (encabezado: ${header.join(",")})`);
    idx.set(col, at);
  }
  const get = (r: string[], c: CsvColumn) => (r[idx.get(c)!] ?? "").trim();

  const rows: ImportRow[] = [];
  const rejected: RejectedRow[] = [];
  for (let i = 1; i < all.length; i++) {
    const raw = all[i];
    const line = i + 1;
    // Línea totalmente vacía (típico al final del archivo): se ignora sin ruido.
    if (raw.every((c) => c.trim() === "")) continue;
    if (raw.length < header.length) {
      rejected.push({ line, reason: `faltan columnas (${raw.length} de ${header.length})`, raw });
      continue;
    }
    const fecha = get(raw, "fecha");
    const detail = normalizeDetail(get(raw, "detalle"));
    const tipo = get(raw, "tipo");
    const medio = get(raw, "medio");
    const montoRaw = get(raw, "monto");
    const confianza = get(raw, "confianza");
    const problems: string[] = [];
    if (!isRealDate(fecha)) problems.push(`fecha inválida "${fecha}"`);
    if (!detail) problems.push("detalle vacío");
    if (!(IMPORT_TYPES as readonly string[]).includes(tipo)) problems.push(`tipo inválido "${tipo}"`);
    if (!(IMPORT_METHODS as readonly string[]).includes(medio)) problems.push(`medio inválido "${medio}"`);
    const cents = parseCents(montoRaw);
    if (cents === null) problems.push(`monto inválido "${montoRaw}"`);
    if (!(CONFIANZA as readonly string[]).includes(confianza)) problems.push(`confianza inválida "${confianza}"`);
    if (problems.length > 0) {
      rejected.push({ line, reason: problems.join("; "), raw });
      continue;
    }
    rows.push({
      line,
      fecha,
      detail,
      type: tipo as ImportType,
      method: medio as CashMethod,
      cents: cents!,
      amount: round2(cents! / 100),
      confianza: confianza as Confianza,
      origen: { archivo: get(raw, "origen_archivo"), hoja: get(raw, "origen_hoja"), fila: get(raw, "origen_fila") },
      nota: get(raw, "nota"),
    });
  }
  return { rows, rejected };
}

// ── Política para las filas `dudoso`: se excluyen por default; `incluir` las trata como
// cualquier otra. La decisión queda en el resumen y en el AuditLog (la deja el script).
export type DudosoPolicy = "excluir" | "incluir";

export function applyDudosoPolicy(
  rows: readonly ImportRow[],
  policy: DudosoPolicy,
): { kept: ImportRow[]; dudosoExcluded: ImportRow[] } {
  if (policy === "incluir") return { kept: [...rows], dudosoExcluded: [] };
  const kept: ImportRow[] = [];
  const dudosoExcluded: ImportRow[] = [];
  for (const r of rows) (r.confianza === "dudoso" ? dudosoExcluded : kept).push(r);
  return { kept, dudosoExcluded };
}

// ── Clave de deduplicación (ver encabezado). Sólo contenido contable: nada de origen,
// confianza ni nota, que son metadatos de la consolidación y no de la caja.
export type KeyFields = {
  fecha: string;
  type: CashMovementType | string;
  method: CashMethod | string;
  cents: number;
  detail: string;
};

export function dedupKey(r: KeyFields): string {
  return `${r.fecha}|${r.type}|${r.method}|${r.cents}|${r.detail}`;
}

// Fila de la base ya proyectada al mismo espacio que el CSV (el script convierte
// `occurredAt` a fecha de pared del negocio y `amount` a centavos antes de llamar).
export type ExistingRow = KeyFields & { id: string; createdBy: string };

export function centsOf(amount: number): number {
  return Math.round(round2(amount) * 100);
}

export type ImportPlan = {
  toInsert: ImportRow[]; // en orden de aparición en el CSV
  alreadyExisting: ImportRow[]; // cubiertas por filas que ya están en la base
  // Filas de la base que llevan la marca de importación pero cuya clave NO está en el
  // CSV: restos de una versión anterior del CSV. Nunca se borran solas — se avisan.
  orphanMarked: ExistingRow[];
};

// Multiconjunto CSV − DB, por clave. Determinístico: para una clave con n filas en el
// CSV y m en la base, quedan como "ya existentes" las PRIMERAS m del CSV y se insertan
// las últimas n−m, así los ids (que llevan la línea del CSV) son estables entre corridas.
export function planImport(
  rows: readonly ImportRow[],
  existing: readonly ExistingRow[],
  marker: string,
): ImportPlan {
  const dbCount = new Map<string, number>();
  for (const e of existing) {
    const k = dedupKey(e);
    dbCount.set(k, (dbCount.get(k) ?? 0) + 1);
  }
  const csvKeys = new Set(rows.map(dedupKey));
  const seen = new Map<string, number>();
  const toInsert: ImportRow[] = [];
  const alreadyExisting: ImportRow[] = [];
  for (const r of rows) {
    const k = dedupKey(r);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n <= (dbCount.get(k) ?? 0)) alreadyExisting.push(r);
    else toInsert.push(r);
  }
  const orphanMarked = existing.filter((e) => e.createdBy === marker && !csvKeys.has(dedupKey(e)));
  return { toInsert, alreadyExisting, orphanMarked };
}

// ── Marca de importación (sin tocar el schema): va en `createdBy`, que es el "actor"
// del movimiento y hoy no se muestra en ninguna pantalla — `reason` queda limpio para
// el negocio. El sufijo es el hash del CSV: identifica QUÉ archivo trajo la fila y es lo
// que usa `--rollback` para deshacer una importación completa.
export const IMPORT_ACTOR_PREFIX = "import:caja-historica:";

export function importMarker(csvSha8: string): string {
  return `${IMPORT_ACTOR_PREFIX}${csvSha8}`;
}

// Id determinístico por (archivo, línea). Dos cosas a la vez: (1) guarda a nivel PK —
// dos corridas concurrentes del mismo CSV no pueden insertar la misma línea dos veces—
// y (2) el libro ordena por (occurredAt, id), así dentro de un mismo día las filas
// importadas conservan el orden del CSV en el saldo corrido. Largo comparable a un cuid.
export function importRowId(csvSha8: string, line: number): string {
  return `imc${csvSha8}${String(line).padStart(7, "0")}`;
}

// ── Agregación para la reconciliación: mes (YYYY-MM) × medio × tipo → centavos.
export type AggKey = `${string}|${CashMethod | string}|${ImportType | string}`;
export type Aggregate = Map<AggKey, number>;

export function aggKey(month: string, method: string, type: string): AggKey {
  return `${month}|${method}|${type}`;
}

export function aggregate(rows: readonly KeyFields[]): Aggregate {
  const out: Aggregate = new Map();
  for (const r of rows) {
    const k = aggKey(r.fecha.slice(0, 7), r.method, r.type);
    out.set(k, (out.get(k) ?? 0) + r.cents);
  }
  return out;
}

export type ReconcileDiff = { key: AggKey; csvCents: number; dbCents: number };

// Compara dos agregados clave por clave (unión de claves). Vacío = cierran al centavo.
export function reconcile(csv: Aggregate, db: Aggregate): ReconcileDiff[] {
  const keys = new Set<AggKey>([...csv.keys(), ...db.keys()]);
  const diffs: ReconcileDiff[] = [];
  for (const k of [...keys].sort()) {
    const a = csv.get(k) ?? 0;
    const b = db.get(k) ?? 0;
    if (a !== b) diffs.push({ key: k, csvCents: a, dbCents: b });
  }
  return diffs;
}

// Multiconjunto "cubierto": para cada clave del CSV, min(csvCount, dbCount) filas de la
// base. Es lo que se compara con el CSV después de escribir: si la base tiene TODO lo
// del CSV, el cubierto es igual al CSV. Las filas de más en la base (cargadas a mano
// o de otro CSV) no entran acá — se informan aparte, no descuadran.
export function coveredByCsv(rows: readonly ImportRow[], existing: readonly ExistingRow[]): ExistingRow[] {
  const csvCount = new Map<string, number>();
  for (const r of rows) {
    const k = dedupKey(r);
    csvCount.set(k, (csvCount.get(k) ?? 0) + 1);
  }
  const taken = new Map<string, number>();
  const out: ExistingRow[] = [];
  for (const e of existing) {
    const k = dedupKey(e);
    const n = (taken.get(k) ?? 0) + 1;
    if (n <= (csvCount.get(k) ?? 0)) {
      taken.set(k, n);
      out.push(e);
    }
  }
  return out;
}

export function fmtCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$${int},${String(abs % 100).padStart(2, "0")}`;
}
