// PROYECTOS — reglas puras: etapas por servicio, totales del presupuesto y qué puede pasar con
// cada versión. Sin base ni React, para probarlas sin nada alrededor.

export const SERVICIOS = ["EVENTOS", "EXPERIENCIAS", "ARQUITECTURA", "BRANDING", "CONTENIDOS"] as const;
export type Servicio = (typeof SERVICIOS)[number];

/** Los nombres son los que el rubro usa en la calle (el sitio de MIA, en su caso). */
export const SERVICIO_LABEL: Record<Servicio, string> = {
  EVENTOS: "Producción de eventos",
  EXPERIENCIAS: "Diseño de experiencias",
  ARQUITECTURA: "Arquitectura promocional",
  BRANDING: "Branding y escenografías",
  CONTENIDOS: "Contenidos transmedia",
};

export const ETAPAS = ["PEDIDO", "DISENO", "RENDER", "PRESUPUESTO", "PROPUESTA", "APROBADO", "PRODUCCION", "ARMADO", "DESARME", "CIERRE"] as const;
export type Etapa = (typeof ETAPAS)[number];

const ETAPA_LABEL: Record<Etapa, string> = {
  PEDIDO: "Pedido",
  DISENO: "Diseño",
  RENDER: "Render 3D",
  PRESUPUESTO: "Presupuesto",
  PROPUESTA: "Propuesta enviada",
  APROBADO: "Aprobado",
  PRODUCCION: "Producción",
  ARMADO: "Armado",
  DESARME: "Desarme",
  CIERRE: "Cierre",
};

/** Un video no se arma ni se desarma, y un evento puede no pasar por el 3D. */
const SIN: Record<Servicio, readonly Etapa[]> = {
  ARQUITECTURA: [],
  BRANDING: [],
  EXPERIENCIAS: [],
  EVENTOS: ["RENDER"],
  CONTENIDOS: ["RENDER", "ARMADO", "DESARME"],
};

export const esServicio = (v: unknown): v is Servicio => typeof v === "string" && (SERVICIOS as readonly string[]).includes(v);
export const esEtapa = (v: unknown): v is Etapa => typeof v === "string" && (ETAPAS as readonly string[]).includes(v);

export function etapasDe(servicio: string): Etapa[] {
  const fuera = esServicio(servicio) ? SIN[servicio] : [];
  return ETAPAS.filter((e) => !fuera.includes(e));
}

export function etapaLabel(etapa: string, servicio?: string): string {
  if (etapa === "DISENO" && servicio === "CONTENIDOS") return "Guion";
  if (etapa === "ARMADO" && servicio === "EVENTOS") return "Armado y evento";
  return esEtapa(etapa) ? ETAPA_LABEL[etapa] : etapa;
}

/** La etapa que sigue en el circuito de ese servicio; null si ya está en la última. */
export function etapaSiguiente(servicio: string, etapa: string): Etapa | null {
  const lista = etapasDe(servicio);
  const i = lista.indexOf(etapa as Etapa);
  return i >= 0 && i < lista.length - 1 ? lista[i + 1] : null;
}

// ── Plata ───────────────────────────────────────────────────────────────────

/** Como lo escribe una persona: "1.500" son mil quinientos, y "1,5" o "1.5" son uno y medio. */
export function leerNumero(texto: string): number {
  const s = texto.trim();
  const limpio = /^\d+\.\d{1,2}$/.test(s) ? s : s.replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

export const redondear = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function pesos(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

export function precioConMargen(costo: number, margenPct: number): number {
  return redondear(costo * (1 + margenPct / 100));
}

export interface ItemCalculable {
  cantidad: number;
  costo: number;
  precio: number;
}

export interface Totales {
  costo: number;
  neto: number;
  iva: number;
  total: number;
  ganancia: number;
  /** Ganancia sobre el precio neto, en %. Es margen, no recargo sobre el costo. */
  margenPct: number;
}

export function totales(items: readonly ItemCalculable[], ivaPct: number): Totales {
  const costo = redondear(items.reduce((s, i) => s + i.cantidad * i.costo, 0));
  const neto = redondear(items.reduce((s, i) => s + i.cantidad * i.precio, 0));
  const iva = redondear((neto * ivaPct) / 100);
  const ganancia = redondear(neto - costo);
  return { costo, neto, iva, total: redondear(neto + iva), ganancia, margenPct: neto > 0 ? redondear((ganancia / neto) * 100) : 0 };
}

/** Agrupa los ítems por rubro respetando el orden en que aparece cada uno. */
export function porRubro<T extends { rubro: string }>(items: readonly T[]): { rubro: string; items: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const it of items) {
    const g = grupos.get(it.rubro);
    if (g) g.push(it);
    else grupos.set(it.rubro, [it]);
  }
  return [...grupos].map(([rubro, lista]) => ({ rubro, items: lista }));
}

export const MEDIOS = ["TRANSFERENCIA", "EFECTIVO", "CHEQUE", "MERCADO_PAGO"] as const;
export type MedioPago = (typeof MEDIOS)[number];
export const MEDIO_LABEL: Record<MedioPago, string> = {
  TRANSFERENCIA: "Transferencia",
  EFECTIVO: "Efectivo",
  CHEQUE: "Cheque",
  MERCADO_PAGO: "Mercado Pago",
};

/** La columna del libro de caja: el cheque y la transferencia van donde el motor lleva lo bancario. */
export function metodoDeCaja(medio: MedioPago): "EFECTIVO" | "MP" {
  return medio === "EFECTIVO" ? "EFECTIVO" : "MP";
}

// ── Presupuesto: qué se puede hacer en cada estado ──────────────────────────

export const ESTADO_PRESUPUESTO_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADO: "Enviado",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  REEMPLAZADO: "Reemplazado",
};

/** Lo que el cliente ya vio no se reescribe: para cambiarlo se abre otra versión. */
export const sePuedeEditar = (estado: string): boolean => estado === "BORRADOR";

export function yaVencio(validoHasta: Date | null | undefined, ahora: Date = new Date()): boolean {
  return !!validoHasta && validoHasta.getTime() < ahora.getTime();
}

/** El cliente sólo responde una propuesta enviada y vigente. */
export function clientePuedeResponder(p: { estado: string; validoHasta: Date | null }, ahora: Date = new Date()): boolean {
  return p.estado === "ENVIADO" && !yaVencio(p.validoHasta, ahora);
}

/** Al aprobar, el proyecto avanza; nunca retrocede si ya estaba más adelante. */
export function etapaAlAprobar(servicio: string, etapaActual: string): Etapa {
  const lista = etapasDe(servicio);
  return lista.indexOf(etapaActual as Etapa) > lista.indexOf("APROBADO") ? (etapaActual as Etapa) : "APROBADO";
}

export const sumarDias = (d: Date, dias: number): Date => new Date(d.getTime() + dias * 86_400_000);

export function fechaCorta(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(d);
}

export function fechaParaInput(d: Date | null | undefined): string {
  return d ? new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10) : "";
}

export function waLink(telefono: string | null | undefined, texto: string): string | null {
  const dig = (telefono ?? "").replace(/\D/g, "");
  return dig.length >= 8 ? `https://wa.me/${dig}?text=${encodeURIComponent(texto)}` : null;
}
