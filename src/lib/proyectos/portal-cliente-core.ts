// ============================================================================
// PROYECTOS · Etapa 2 · T5 — portal por cliente: reglas PURAS (sin base ni React).
// ============================================================================
// El cliente ve en qué está cada evento con palabras suyas: las etapas internas de la productora (brief, desglose,
// cotización, desarrollo técnico) no se le muestran; todo lo que no sea un paso que él reconoce dice «En preparación».
// Falla cerrado: una etapa desconocida también es «En preparación».

export const EN_PREPARACION = "En preparación";

const ETAPA_PARA_EL_CLIENTE: Record<string, string> = {
  PROPUESTA: "Propuesta enviada",
  APROBADO: "Confirmado",
  PRODUCCION: "En producción",
  ARMADO: "En producción",
  DESARME: "Evento en curso",
  CIERRE: "Realizado",
};

/** La etapa como la lee el cliente. Las internas (PEDIDO, DISENO, RENDER, PRESUPUESTO) y cualquier otra → «En preparación». */
export function etapaParaElCliente(etapa: string | null | undefined): string {
  if (typeof etapa !== "string") return EN_PREPARACION;
  return Object.prototype.hasOwnProperty.call(ETAPA_PARA_EL_CLIENTE, etapa) ? ETAPA_PARA_EL_CLIENTE[etapa] : EN_PREPARACION;
}

/** Token del link: el mismo formato que el del portal del proyecto (base64url, 20 o más caracteres). */
export const TOKEN_PORTAL_VALIDO = /^[A-Za-z0-9_-]{20,}$/;
export const esTokenDePortal = (t: unknown): t is string => typeof t === "string" && t.length <= 200 && TOKEN_PORTAL_VALIDO.test(t);

/** Lo único que sale de cada evento hacia la página pública. Ver portalClientePublico. */
export interface EventoDelCliente {
  nombre: string;
  servicio: string;
  evento: string | null;
  tipoEvento: string | null;
  lugar: string | null;
  ciudad: string | null;
  fechaEvento: Date | null;
  fechaFin: Date | null;
  etapa: string;
  /** El portal del proyecto, si la productora ya lo compartió; si no, null (el ítem va sin link). */
  tokenPortal: string | null;
}

/** Las claves permitidas de cada evento (lista blanca, la usan la lectura y su test). */
export const CLAVES_EVENTO_DEL_CLIENTE = ["nombre", "servicio", "evento", "tipoEvento", "lugar", "ciudad", "fechaEvento", "fechaFin", "etapa", "tokenPortal"] as const;

/**
 * Próximos arriba (el más cercano primero; los sin fecha al final, «a confirmar») y pasados abajo (el más reciente
 * primero). Un evento es pasado cuando terminó antes de hoy: su fin (o su fecha) es anterior al inicio de `hoy`.
 */
export function separarEventos<T extends { fechaEvento: Date | null; fechaFin: Date | null }>(eventos: readonly T[], hoy: Date): { proximos: T[]; pasados: T[] } {
  const inicioHoy = new Date(hoy);
  inicioHoy.setHours(0, 0, 0, 0);
  const fin = (e: T) => (e.fechaFin ?? e.fechaEvento)?.getTime() ?? null;
  const proximos: T[] = [];
  const pasados: T[] = [];
  for (const e of eventos) {
    const f = fin(e);
    if (f !== null && f < inicioHoy.getTime()) pasados.push(e);
    else proximos.push(e);
  }
  const t = (e: T) => e.fechaEvento?.getTime() ?? null;
  proximos.sort((x, y) => {
    const a = t(x);
    const b = t(y);
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return a - b;
  });
  pasados.sort((x, y) => (t(y) ?? fin(y) ?? 0) - (t(x) ?? fin(x) ?? 0));
  return { proximos, pasados };
}
