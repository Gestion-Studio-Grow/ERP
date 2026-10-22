// ============================================================================
// «TODOS LOS TURNOS» (/admin/turnos/lista) — qué ventana se carga y cómo se dice. PURO.
// ============================================================================
//
// B8: la lista traía 365 días + todo el futuro en cada apertura (la página es `force-dynamic`).
// Ahora arranca en los últimos 90 días y ofrece «Ver más atrás» (?desde=AAAA-MM-DD), de a 90.
// Los pasados sin cerrar NO dependen de esta ventana: los cuenta un loader propio sin tope de
// días (src/apps/kpis/turnos-sin-cerrar.server.ts) y se cierran en /admin/turnos/cerrar.
// Lo prueba lista-core.test.ts.

/** Días hacia atrás que carga la lista si no se pide otra cosa (y lo que suma «Ver más atrás»). */
export const DIAS_DE_LA_LISTA = 90;
/** Techo de cuánto se puede ir para atrás con ?desde= (5 años): una URL no tumba la página. */
export const DIAS_MAXIMOS_DE_LA_LISTA = 5 * 365;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function esFechaReal(s: string): boolean {
  if (!FECHA.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** «AAAA-MM-DD» corrido `n` días (negativo = para atrás), estable ante zonas (mediodía UTC). */
export function correrDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00.000Z`) - Date.parse(`${desde}T12:00:00.000Z`)) / 86_400_000);
}

export interface VentanaDeLista {
  /** Primer día que se ve (AAAA-MM-DD, del negocio). */
  desde: string;
  /** Días para `getAppointments(rangeDays)`: cubre `desde` entero aunque la hora de ahora sea tarde. */
  dias: number;
  /** El ?desde= de «Ver más atrás», o `null` si ya se llegó al techo. */
  masAtras: string | null;
}

/**
 * La ventana que carga la lista. `?desde=` vale si es una fecha real, anterior a hoy y dentro
 * del techo; si no (vacía, inventada, futura, de hace 20 años), los 90 días de siempre.
 */
export function ventanaDeLista(desdeCrudo: string | string[] | undefined, hoy: string): VentanaDeLista {
  const pedido = Array.isArray(desdeCrudo) ? desdeCrudo[0] : desdeCrudo;
  const techo = correrDias(hoy, -DIAS_MAXIMOS_DE_LA_LISTA);
  const porDefecto = correrDias(hoy, -DIAS_DE_LA_LISTA);
  const desde = pedido && esFechaReal(pedido) && pedido < porDefecto && pedido >= techo ? pedido : porDefecto;
  const siguiente = correrDias(desde, -DIAS_DE_LA_LISTA);
  return {
    desde,
    dias: diasEntre(desde, hoy) + 1,
    masAtras: desde > techo ? (siguiente < techo ? techo : siguiente) : null,
  };
}

/**
 * «24/07/2026» de un día del negocio. Del texto, no de un `Date`: «2026-07-24» leído como fecha
 * es la medianoche UTC, que en Buenos Aires todavía es el 23.
 */
export function diaCorto(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

/** El renglón que reemplaza la sección «Pasados sin cerrar»: «3 pasados sin cerrar». */
export function textoSinCerrar(n: number): string {
  return n === 1 ? "1 pasado sin cerrar" : `${n} pasados sin cerrar`;
}
