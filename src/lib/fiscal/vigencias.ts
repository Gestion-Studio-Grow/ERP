/**
 * Montos fiscales con FECHA DE VIGENCIA (R0-F4).
 *
 * Regla del frente: un monto que fija una norma NO se escribe suelto en el código
 * que decide. Vive acá, en una tabla con la fecha desde la que rige, la norma y la
 * fuente. Cuando ARCA o la Secretaría actualizan un monto, se AGREGA una fila con
 * su fecha (nunca se pisa la anterior): así un comprobante se decide con el valor
 * que regía el día del comprobante, y el de ayer sigue decidiéndose igual.
 *
 * Cada fila dice cómo se verificó. Lo que no se pudo leer de la fuente primaria
 * lo dice explícitamente ("a verificar en el Boletín Oficial").
 *
 * Una tabla mal cargada (fechas desordenadas, monto en cero, sin norma) NO se
 * usa: `vigenteEn` devuelve `null` ("no sé qué monto regía") y la decisión
 * bloquea el comprobante con un mensaje. No se corta al importar el módulo: eso
 * tiraría abajo cualquier pantalla que lo importe, no sólo la emisión. El test
 * de las tablas cargadas corre en `npm test`, antes de cada deploy.
 *
 * PURO: sin I/O, sin Prisma, sin fecha del sistema (la fecha la pasa quien llama).
 */

/** Un valor que rige desde una fecha hasta el día anterior a la fila siguiente. */
export interface Vigencia {
  /** Primer día en que rige (inclusive). Formato AAAA-MM-DD. */
  readonly desde: string;
  /** Monto en pesos. */
  readonly valor: number;
  /** Norma que fija el valor. */
  readonly norma: string;
  /** Dónde se leyó. */
  readonly fuente: string;
  /** Cómo se verificó (y qué falta verificar). */
  readonly verificacion: string;
}

/** Una tabla de vigencias: qué mide y cómo se compara el importe contra el valor. */
export interface TablaVigencias {
  readonly id: string;
  /** Nombre en castellano llano (lo puede mostrar una pantalla). */
  readonly nombre: string;
  /** Cómo se aplica el monto. Todas las de hoy son "igual o superior". */
  readonly comparacion: "igual_o_superior";
  readonly vigencias: readonly Vigencia[];
}

/** Congela la tabla y sus filas: nadie la puede tocar en ejecución. */
function congelar(tabla: TablaVigencias): TablaVigencias {
  tabla.vigencias.forEach((fila) => Object.freeze(fila));
  Object.freeze(tabla.vigencias);
  return Object.freeze(tabla);
}

/**
 * Importe desde el cual el comprobante a un CONSUMIDOR FINAL tiene que llevar su
 * CUIT, CUIL, CDI o DNI. RG ARCA 5700/2025: "cuando el importe de la operación
 * sea igual o superior a $10.000.000", para operaciones desde el 29/05/2025.
 *
 * No se cargan los importes anteriores ($417.288 / $208.644) porque no se pudo
 * fijar con fuente la fecha exacta desde la que regían: un comprobante con fecha
 * anterior a la primera fila NO se decide con un monto inventado, va a revisión.
 */
export const UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL: TablaVigencias = congelar({
  id: "umbral-identificacion-consumidor-final",
  nombre: "Importe desde el que hay que identificar al consumidor final",
  comparacion: "igual_o_superior",
  vigencias: [
    {
      desde: "2025-05-29",
      valor: 10_000_000,
      norma: "RG ARCA 5700/2025",
      fuente:
        "Resúmenes de búsqueda de Errepar, Contadores en Red y la Universidad de Palermo (mayo de 2025). " +
        "Texto oficial, sin leer: Boletín Oficial del 27/05/2025, aviso 326006",
      verificacion:
        "Monto, fecha, criterio \"igual o superior\" y documentos (CUIT, CUIL, CDI o DNI) coinciden en " +
        "resúmenes de búsqueda de fuentes secundarias. El Boletín Oficial, argentina.gob.ar y afip.gob.ar " +
        "no se pudieron abrir desde este entorno (a verificar).",
    },
  ],
});

/**
 * Monto mínimo desde el cual una MiPyME que le factura a una GRAN EMPRESA está
 * obligada a emitir Factura de Crédito Electrónica (Ley 27.440). Se compara
 * contra el importe total del comprobante, "igual o superior".
 */
export const MONTO_MINIMO_FCE_MIPYME: TablaVigencias = congelar({
  id: "monto-minimo-fce-mipyme",
  nombre: "Monto mínimo de la Factura de Crédito Electrónica MiPyME",
  comparacion: "igual_o_superior",
  vigencias: [
    {
      desde: "2025-04-11",
      valor: 3_958_316,
      norma: "Resolución 54/2025 de la Secretaría PyME (según fuentes secundarias)",
      fuente:
        "iProfesional (nota 425814), CAME (novedad 14183), Arizmendi (\"a partir del 11 de abril " +
        "de 2025\"), abril de 2025",
      verificacion:
        "Monto ($3.958.316, antes $1.357.480) y fecha (comprobantes emitidos desde el 11/04/2025) " +
        "coinciden en resúmenes de búsqueda de esas fuentes secundarias, igual que el número de la " +
        "norma. El texto del Boletín Oficial no se pudo abrir desde este entorno (a verificar).",
    },
    {
      desde: "2026-04-14",
      valor: 5_549_862,
      norma: "Resolución 1/2026 de la Secretaría de Industria y Comercio",
      fuente:
        "Resúmenes de búsqueda de Contadores en Red, Palazzo & Asociados y LL&A (abril de 2026). " +
        "Texto oficial, sin leer: la resolución en el Boletín Oficial y la página de FCE de ARCA",
      verificacion:
        "Monto ($5.549.862, antes $3.958.316) y fecha (desde el 14/04/2026) coinciden en resúmenes de " +
        "búsqueda de esas fuentes secundarias, igual que el número de la norma. El criterio \"igual o " +
        "superior\" no se leyó en la fuente primaria. ARCA y el Boletín Oficial no se pudieron abrir " +
        "desde este entorno (a verificar).",
    },
  ],
});

/** Todas las tablas, para validarlas juntas y para listarlas. */
export const TABLAS_DE_VIGENCIAS: readonly TablaVigencias[] = [
  UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL,
  MONTO_MINIMO_FCE_MIPYME,
];

// ─── Fechas ────────────────────────────────────────────────────────────────────

const RE_AAAAMMDD = /^(\d{4})(\d{2})(\d{2})$/;
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Normaliza una fecha de calendario al formato de ARCA (`AAAAMMDD`). Acepta
 * `AAAAMMDD` (el formato del Core y de WSFEv1) o `AAAA-MM-DD`. Devuelve `null`
 * si no es una fecha que exista (30 de febrero, mes 13, texto suelto).
 * Trabaja en UTC y sin hora: no depende del huso del servidor.
 */
export function normalizarFecha(fecha: string | null | undefined): string | null {
  if (typeof fecha !== "string") return null;
  const t = fecha.trim();
  const m = RE_AAAAMMDD.exec(t) ?? RE_ISO.exec(t);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (anio < 1900 || mes < 1 || mes > 12 || dia < 1) return null;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return `${m[1]}${m[2]}${m[3]}`;
}

/** Días de `desde` a `hasta` (negativo si `hasta` es anterior). Ambas `AAAAMMDD` válidas. */
export function diasEntre(desde: string, hasta: string): number {
  const aUtc = (f: string) =>
    Date.UTC(Number(f.slice(0, 4)), Number(f.slice(4, 6)) - 1, Number(f.slice(6, 8)));
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_POR_DIA);
}

// ─── Consulta ──────────────────────────────────────────────────────────────────

/**
 * La fila que rige en `fecha` (inclusive desde su `desde`), o `null` si la fecha
 * es inválida, anterior a la primera fila o la tabla está mal cargada. `null` NO
 * significa "no hay tope": significa "no sé qué monto regía", y quien decide lo
 * tiene que tratar como revisión o bloqueo, nunca como vía libre.
 */
export function vigenteEn(
  tabla: TablaVigencias | readonly Vigencia[],
  fecha: string | null | undefined,
): Vigencia | null {
  const f = normalizarFecha(fecha);
  if (!f) return null;
  const t: TablaVigencias =
    "vigencias" in tabla
      ? tabla
      : { id: "(sin id)", nombre: "(sin nombre)", comparacion: "igual_o_superior", vigencias: tabla };
  if (!tablaSana(t)) return null;
  // Sana = fechas estrictamente crecientes: rige la última que ya empezó.
  let vigente: Vigencia | null = null;
  for (const fila of t.vigencias) {
    if (normalizarFecha(fila.desde)! <= f) vigente = fila;
  }
  return vigente;
}

/**
 * Controles de forma de una tabla: fechas válidas en AAAA-MM-DD, estrictamente
 * crecientes (sin dos filas el mismo día), montos positivos y finitos, norma y
 * fuente cargadas. Devuelve la lista de problemas (vacía = tabla sana).
 */
export function problemasDeLaTabla(tabla: TablaVigencias): string[] {
  const problemas: string[] = [];
  if (tabla.vigencias.length === 0) problemas.push(`${tabla.id}: no tiene ninguna fila`);
  let anterior: string | null = null;
  tabla.vigencias.forEach((fila, i) => {
    const donde = `${tabla.id}[${i}]`;
    if (typeof fila.desde !== "string" || !RE_ISO.test(fila.desde) || !normalizarFecha(fila.desde)) {
      problemas.push(`${donde}: "${fila.desde}" no es una fecha AAAA-MM-DD que exista`);
    } else {
      const f = normalizarFecha(fila.desde)!;
      if (anterior && f <= anterior) {
        problemas.push(`${donde}: las filas tienen que ir de la más vieja a la más nueva, sin repetir fecha`);
      }
      anterior = f;
    }
    if (typeof fila.valor !== "number" || !Number.isFinite(fila.valor) || fila.valor <= 0) {
      problemas.push(`${donde}: el monto tiene que ser un número mayor a cero`);
    }
    const vacio = (v: unknown) => typeof v !== "string" || v.trim() === "";
    if (vacio(fila.norma)) problemas.push(`${donde}: falta la norma`);
    if (vacio(fila.fuente)) problemas.push(`${donde}: falta la fuente`);
    if (vacio(fila.verificacion)) problemas.push(`${donde}: falta decir cómo se verificó`);
  });
  return problemas;
}

// Las tablas no cambian en ejecución: se controlan una vez por objeto.
const SANAS = new WeakMap<object, boolean>();

/** `true` si la tabla no tiene ningún problema de forma (resultado memorizado). */
export function tablaSana(tabla: TablaVigencias): boolean {
  let sana = SANAS.get(tabla);
  if (sana === undefined) {
    sana = problemasDeLaTabla(tabla).length === 0;
    SANAS.set(tabla, sana);
  }
  return sana;
}
