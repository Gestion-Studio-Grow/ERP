// PROYECTOS — reglas puras: etapas por servicio, totales del presupuesto y qué puede pasar con
// cada versión. Sin base ni React, para probarlas sin nada alrededor.

import { admiteCentavos, redondearAlCentavo } from "@/lib/dinero/redondeo";
import { waLinkClienta } from "@/lib/whatsapp-cta";

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

export const redondear = redondearAlCentavo;

export function pesos(n: number): string {
  // Sin centavos si el importe no los tiene; con ellos, tal cual: un cobro de $ 1.500,75 no se muestra como $ 1.501.
  const d = admiteCentavos(n) && !Number.isInteger(n) ? 2 : 0;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}

export function porcentaje(n: number): string {
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
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

// ── Costo real ────────────────────────────────────────────────────────────

export interface GastoCalculable {
  rubro: string;
  neto: number;
  iva: number;
  pagadoEl: Date | null;
  anuladoEl: Date | null;
}

/** Lo que sale de la caja por un gasto. */
export const totalDelGasto = (g: { neto: number; iva: number }): number => redondear(g.neto + g.iva);

export interface ResultadoReal {
  conGastos: boolean;
  /** Sin IVA, para compararlo contra el costo presupuestado. */
  costoReal: number;
  /** Con IVA: es lo que salió o va a salir de la caja. */
  pagado: number;
  porPagar: number;
  /** Real menos presupuestado: positivo es que se gastó de más. Null sin presupuesto aprobado o sin gastos. */
  desvio: number | null;
  /** Null sin presupuesto aprobado o sin gastos: sin gastos cargados no hay ganancia real para mostrar. */
  gananciaReal: number | null;
  margenReal: number | null;
}

/** Lo que dejó el trabajo con los gastos cargados hasta ahora. Los anulados no cuentan. PURA. */
export function resultadoReal(t: Totales | null, gastos: readonly GastoCalculable[]): ResultadoReal {
  const vivos = gastos.filter((g) => !g.anuladoEl);
  const costoReal = redondear(vivos.reduce((s, g) => s + g.neto, 0));
  const pagado = redondear(vivos.filter((g) => g.pagadoEl).reduce((s, g) => s + g.neto + g.iva, 0));
  const porPagar = redondear(vivos.filter((g) => !g.pagadoEl).reduce((s, g) => s + g.neto + g.iva, 0));
  const conGastos = vivos.length > 0;
  if (!t || !conGastos) return { conGastos, costoReal, pagado, porPagar, desvio: null, gananciaReal: null, margenReal: null };
  const gananciaReal = redondear(t.neto - costoReal);
  return {
    conGastos,
    costoReal,
    pagado,
    porPagar,
    desvio: redondear(costoReal - t.costo),
    gananciaReal,
    margenReal: t.neto > 0 ? redondear((gananciaReal / t.neto) * 100) : 0,
  };
}

export interface DesvioDeRubro {
  rubro: string;
  presupuestado: number;
  real: number;
  diferencia: number;
}

/**
 * Presupuestado contra real, rubro por rubro. «Producción» y «producción » son el mismo rubro: se tipean a mano.
 * Primero los del presupuesto, en su orden; después lo que se gastó en rubros que no estaban. PURA.
 */
export function desvioPorRubro(items: readonly (ItemCalculable & { rubro: string })[], gastos: readonly GastoCalculable[]): DesvioDeRubro[] {
  const filas = new Map<string, { rubro: string; presupuestado: number; real: number }>();
  const fila = (rubro: string) => {
    const nombre = rubro.trim() || "General";
    const clave = nombre.toLowerCase();
    let f = filas.get(clave);
    if (!f) {
      f = { rubro: nombre, presupuestado: 0, real: 0 };
      filas.set(clave, f);
    }
    return f;
  };
  for (const i of items) fila(i.rubro).presupuestado += i.cantidad * i.costo;
  for (const g of gastos) if (!g.anuladoEl) fila(g.rubro).real += g.neto;
  return [...filas.values()].map((f) => ({
    rubro: f.rubro,
    presupuestado: redondear(f.presupuestado),
    real: redondear(f.real),
    diferencia: redondear(f.real - f.presupuestado),
  }));
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

/**
 * La columna del libro de caja. El cheque va con la transferencia porque el libro no tiene columna de
 * cheques, y el asiento lo dice en su detalle. Sin la columna en la base, lo bancario sigue en `MP`.
 */
export function metodoDeCaja(medio: MedioPago, transferenciaEnElLibro = false): "EFECTIVO" | "MP" | "TRANSFERENCIA" {
  if (medio === "EFECTIVO") return "EFECTIVO";
  if (medio === "MERCADO_PAGO") return "MP";
  return transferenciaEnElLibro ? "TRANSFERENCIA" : "MP";
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

/** Con el 549 del celular argentino que wa.me necesita; `null` si el número cargado no sirve. */
export const waLink = waLinkClienta;

// ── Entregables ─────────────────────────────────────────────────────────────

export type EstadoEntregable = "SIN_VERSION" | "BORRADOR" | "EN_REVISION" | "CAMBIOS" | "APROBADO";

export const ESTADO_ENTREGABLE_LABEL: Record<EstadoEntregable, string> = {
  SIN_VERSION: "Sin versión",
  BORRADOR: "Borrador sin enviar",
  EN_REVISION: "Esperando al cliente",
  CAMBIOS: "Cambios pedidos",
  APROBADO: "Aprobado",
};

type VersionConEstado = { numero: number; estado: string };

/** La última que vio el cliente. Un borrador todavía no existe para él. */
export function ultimaEnviada<T extends VersionConEstado>(versiones: readonly T[]): T | null {
  return versiones.filter((v) => v.estado !== "BORRADOR").reduce<T | null>((m, v) => (!m || v.numero > m.numero ? v : m), null);
}

/** Manda la última enviada: un borrador encima no le saca la aprobación ni los cambios pedidos a lo que el cliente vio. */
export function estadoDelEntregable(versiones: readonly VersionConEstado[]): EstadoEntregable {
  const u = ultimaEnviada(versiones);
  if (!u) return versiones.length > 0 ? "BORRADOR" : "SIN_VERSION";
  if (u.estado === "APROBADA") return "APROBADO";
  return u.estado === "CAMBIOS" ? "CAMBIOS" : "EN_REVISION";
}

/** Para corregir: pidieron cambios y todavía nadie empezó la versión siguiente. */
export function resumenEntregables(lista: readonly { versiones: readonly VersionConEstado[] }[]) {
  const estados = lista.map((e) => ({ estado: estadoDelEntregable(e.versiones), conBorrador: e.versiones.some((v) => v.estado === "BORRADOR") }));
  return {
    total: lista.length,
    aprobados: estados.filter((e) => e.estado === "APROBADO").length,
    esperando: estados.filter((e) => e.estado === "EN_REVISION").length,
    paraCorregir: estados.filter((e) => e.estado === "CAMBIOS" && !e.conBorrador).length,
  };
}

/** Lo que importa de una pieza cambia con el servicio: una lona se mide, un video se publica. */
export function ayudaEspecificacion(servicio: string): string {
  if (servicio === "CONTENIDOS") return "Plataforma, formato, duración";
  if (servicio === "BRANDING" || servicio === "ARQUITECTURA") return "Medida, material, instalación";
  return "Medida, formato o material";
}
