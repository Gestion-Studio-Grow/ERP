// ============================================================================
// Carnicería — CADENA DE FRÍO. PURA.
// ============================================================================
//
// La carnicería anota la temperatura de cada equipo (cámara, exhibidora) y la pantalla dice si
// quedó fuera de rango o si hoy todavía nadie lo midió. Las lecturas viven en `RegistroFrio`
// (prisma/pending-gate2/CadenaDeFrio.sql, SQL crudo). El rango es por negocio y se guarda junto
// a la config de la caja (supermercado/config-repo.ts, sin migración) como campo OPCIONAL: sin
// guardar, vale el de fábrica.

export const EQUIPO_MAX = 40;
export const NOTA_FRIO_MAX = 200;
export const TEMP_MIN_C = -40;
export const TEMP_MAX_C = 40;

export type RangoFrio = { minC: number; maxC: number };

/** Provisional a confirmar con el dueño (carne refrigerada: 0 a 4 °C). Configurable por negocio. */
export const RANGO_FRIO_POR_DEFECTO: RangoFrio = { minC: 0, maxC: 4 };

export type LecturaNueva = { equipo: string; temperaturaC: number; nota: string | null };

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

/** "-1,5" / "3.25" / -2 → número con hasta 2 decimales; null si no se entiende. */
export function leerTemperatura(x: unknown): number | null {
  // Sólo un número decimal con coma o punto: Number() solo aceptaría "0x10" o "1e1" (certificación T5, O2).
  const n = typeof x === "string" ? (/^-?\d+([.,]\d+)?$/.test(x.trim()) ? Number(x.trim().replace(",", ".")) : Number.NaN) : x;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/** El nombre del equipo, sin espacios de más ("  Cámara   1 " → "Cámara 1"). */
export function normalizarEquipo(x: string): string {
  return x.trim().replace(/\s+/g, " ");
}

export function validarLectura(entrada: { equipo: unknown; temperatura: unknown; nota?: unknown }): Resultado<LecturaNueva> {
  const equipo = typeof entrada.equipo === "string" ? normalizarEquipo(entrada.equipo) : "";
  if (!equipo) return { ok: false, error: "Escribí qué equipo mediste (por ejemplo «Cámara 1» o «Exhibidora»)." };
  if (equipo.length > EQUIPO_MAX) return { ok: false, error: `El nombre del equipo tiene más de ${EQUIPO_MAX} letras: acortalo.` };
  const t = leerTemperatura(entrada.temperatura);
  if (t === null) return { ok: false, error: "Escribí la temperatura en grados, con coma si hace falta (por ejemplo 3,5 o -18)." };
  if (t < TEMP_MIN_C || t > TEMP_MAX_C) {
    return { ok: false, error: `La temperatura va de ${TEMP_MIN_C} a ${TEMP_MAX_C} °C. Revisá el termómetro y el signo.` };
  }
  const nota = typeof entrada.nota === "string" ? entrada.nota.trim() : "";
  if (nota.length > NOTA_FRIO_MAX) return { ok: false, error: `La nota tiene más de ${NOTA_FRIO_MAX} letras: acortala.` };
  return { ok: true, valor: { equipo, temperaturaC: t, nota: nota || null } };
}

export function validarRangoFrio(entrada: { minC: unknown; maxC: unknown }): Resultado<RangoFrio> {
  const minC = leerTemperatura(entrada.minC);
  const maxC = leerTemperatura(entrada.maxC);
  if (minC === null || maxC === null) return { ok: false, error: "Escribí la mínima y la máxima en grados (por ejemplo 0 y 4)." };
  if (minC < TEMP_MIN_C || maxC > TEMP_MAX_C) return { ok: false, error: `El rango va de ${TEMP_MIN_C} a ${TEMP_MAX_C} °C.` };
  if (minC >= maxC) return { ok: false, error: "La mínima tiene que ser menor que la máxima." };
  return { ok: true, valor: { minC, maxC } };
}

/** El rango guardado si es válido; null si no hay o vino roto (se usa el de fábrica). */
export function rangoFrioDesdeAfuera(x: unknown): RangoFrio | null {
  if (!x || typeof x !== "object") return null;
  const o = x as { minC?: unknown; maxC?: unknown };
  if (typeof o.minC !== "number" || typeof o.maxC !== "number") return null;
  const r = validarRangoFrio({ minC: o.minC, maxC: o.maxC });
  return r.ok ? r.valor : null;
}

export function dentroDeRango(temperaturaC: number, rango: RangoFrio): boolean {
  return temperaturaC >= rango.minC && temperaturaC <= rango.maxC;
}

// ── Estado por equipo ──────────────────────────────────────────────────────────────────────────

export type Lectura = { id: string; equipo: string; temperaturaC: number; medidoEn: Date; medidoPor: string | null; nota: string | null };

/**
 * ok: la última lectura de HOY está en rango · fuera-de-rango: la última de hoy no ·
 * sin-lectura-hoy: hoy nadie lo midió (la última es de otro día).
 */
export type EstadoEquipo = "ok" | "fuera-de-rango" | "sin-lectura-hoy";

export type ResumenEquipo = { equipo: string; ultima: Lectura; estado: EstadoEquipo; lecturas: Lectura[] };

/** `diaDe` da el día del negocio (YYYY-MM-DD) de un instante; `hoy`, el de hoy. */
export function estadoDeEquipo(ultima: Lectura, rango: RangoFrio, hoy: string, diaDe: (d: Date) => string): EstadoEquipo {
  if (diaDe(ultima.medidoEn) !== hoy) return "sin-lectura-hoy";
  return dentroDeRango(ultima.temperaturaC, rango) ? "ok" : "fuera-de-rango";
}

const ORDEN: Record<EstadoEquipo, number> = { "fuera-de-rango": 0, "sin-lectura-hoy": 1, ok: 2 };

/**
 * Agrupa las lecturas por equipo (sin distinguir mayúsculas), la más nueva primero, y calcula el
 * estado. Primero lo que pide acción (fuera de rango, sin medir hoy), después por nombre.
 */
export function resumenPorEquipo(lecturas: Lectura[], rango: RangoFrio, hoy: string, diaDe: (d: Date) => string): ResumenEquipo[] {
  const grupos = new Map<string, Lectura[]>();
  for (const l of lecturas) {
    const k = normalizarEquipo(l.equipo).toLocaleLowerCase("es-AR");
    const g = grupos.get(k);
    if (g) g.push(l);
    else grupos.set(k, [l]);
  }
  const out: ResumenEquipo[] = [];
  for (const g of grupos.values()) {
    g.sort((a, b) => b.medidoEn.getTime() - a.medidoEn.getTime());
    const ultima = g[0];
    out.push({ equipo: normalizarEquipo(ultima.equipo), ultima, estado: estadoDeEquipo(ultima, rango, hoy, diaDe), lecturas: g });
  }
  return out.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.equipo.localeCompare(b.equipo, "es-AR"));
}

// ── ¿Se ve la sección? ─────────────────────────────────────────────────────────────────────────

/**
 * · "no-aplica": el negocio no vende perecederos (CH, velas, pádel) → no ve la sección.
 * · "falta-migracion": vende perecederos pero RegistroFrio no está → «En preparación», sin consultarla.
 * · "lista": se anota y se lee.
 */
export type EstadoCadenaDeFrio = "lista" | "falta-migracion" | "no-aplica";

export function estadoCadenaDeFrio(perecederos: boolean, migrada: boolean): EstadoCadenaDeFrio {
  if (!perecederos) return "no-aplica";
  return migrada ? "lista" : "falta-migracion";
}

/**
 * Lo que necesita la pantalla, con las dependencias inyectadas: si la tabla no está (o el
 * negocio no aplica) NO se llama a `leer` (cero consultas a RegistroFrio).
 */
export async function cargarCadenaDeFrio<T>(
  perecederos: boolean,
  deps: { migrada: () => Promise<boolean>; leer: () => Promise<T> },
): Promise<{ estado: "lista"; datos: T } | { estado: "falta-migracion" | "no-aplica" }> {
  if (!perecederos) return { estado: "no-aplica" };
  const estado = estadoCadenaDeFrio(true, await deps.migrada());
  if (estado !== "lista") return { estado };
  return { estado, datos: await deps.leer() };
}

/** "3,5 °C" */
export function fmtTemperatura(t: number): string {
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(t)} °C`;
}
