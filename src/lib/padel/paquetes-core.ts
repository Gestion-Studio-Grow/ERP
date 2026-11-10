// ============================================================================
// PADEL-CLASES · T5 — reglas puras de los PAQUETES de clases y del PRECIO POR CLUB.
// ============================================================================
//
// Paquete: el profe le vende N clases a un alumno por un precio (efectivo, transferencia o Mercado
// Pago, cobrado a mano). Esa plata entra el día de la venta. Después, al cobrar una clase del alumno,
// el profe puede «descontarla del paquete»: la clase queda PAGADO con medio PAQUETE (no es plata
// nueva: no suma en lo cobrado, igual que «Saldo a favor»).
//
// Lo que QUEDA no es una columna: N − las clases que siguen pagadas con PAQUETE contra ese paquete.
// Una clase del paquete que se cancela vuelve a PENDIENTE (pagoAlCancelar) y la clase vuelve sola al
// paquete; nada que sincronizar.
//
// Precio por club: cada club puede tener su precio individual y grupal (por persona); el que no está
// cargado (o el club sin fila) cae en el de la lista general (PadelConfig).
//
// Sin dependencias de servidor: lo usan las acciones, las pantallas y los tests.

import { leerImporte } from "@/lib/dinero/leer";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import { MEDIOS_COBRO, type MedioCobro } from "./core";
import { PRECIO_MAXIMO } from "./config-campos";

/** El medio con que queda pagada una clase descontada de un paquete. */
export const MEDIO_PAQUETE = "PAQUETE" as const;

/**
 * Medios de una clase PAGADA que NO son plata nueva (ya se contó cuando entró): no suman en
 * «cobrado» (Hoy, Semana, Plata). El saldo a favor (M-024) y el paquete (T5).
 */
export const MEDIOS_SIN_PLATA_NUEVA: readonly string[] = ["SALDO_A_FAVOR", MEDIO_PAQUETE];

/** Filtro de Prisma: pagos con plata nueva (o sin medio, los de antes). */
export const FILTRO_PLATA_NUEVA = { OR: [{ pagoMedio: null }, { pagoMedio: { notIn: [...MEDIOS_SIN_PLATA_NUEVA] } }] };

/** Tope de clases por paquete: más es un dedo que se quedó apretado (la base también lo frena). */
export const MAX_CLASES_PAQUETE = 100;

export type PaqueteValido = { ok: true; clases: number; precio: number; medio: MedioCobro } | { ok: false; error: string };

/** Lo que manda la pantalla «Vender paquete», validado (cantidad, precio con lector de plata, medio). */
export function paqueteValido(raw: { clases: unknown; precio: unknown; medio: unknown }): PaqueteValido {
  const clases = typeof raw.clases === "number" ? raw.clases : Number(String(raw.clases ?? "").trim());
  if (!Number.isInteger(clases) || clases < 1 || clases > MAX_CLASES_PAQUETE) return { ok: false, error: `Poné cuántas clases (de 1 a ${MAX_CLASES_PAQUETE}).` };
  let precio: number | null;
  if (typeof raw.precio === "number") precio = Number.isFinite(raw.precio) ? redondearAlCentavo(raw.precio) : null;
  else {
    const l = leerImporte(String(raw.precio ?? ""));
    precio = l.estado === "ok" ? l.valor : null;
  }
  if (precio === null || precio <= 0 || precio > PRECIO_MAXIMO) return { ok: false, error: "Poné cuánto te pagó por el paquete." };
  if (!(MEDIOS_COBRO as readonly string[]).includes(String(raw.medio))) return { ok: false, error: "Elegí cómo te pagó." };
  return { ok: true, clases, precio, medio: raw.medio as MedioCobro };
}

export interface PaqueteConUso {
  id: string;
  clases: number;
  /** Clases del paquete que siguen pagadas con PAQUETE. */
  usadas: number;
  pagadoEl: Date;
  anuladoEl?: Date | null;
}

/** Cuántas clases le quedan a un paquete (nunca negativo; uno anulado no tiene). */
export const quedanDe = (p: Pick<PaqueteConUso, "clases" | "usadas" | "anuladoEl">): number => (p.anuladoEl ? 0 : Math.max(0, Math.trunc(p.clases) - Math.trunc(p.usadas)));

/** Lo que le queda al alumno sumando todos sus paquetes vivos. */
export const quedanEnTotal = (ps: readonly Pick<PaqueteConUso, "clases" | "usadas" | "anuladoEl">[]): number => ps.reduce((s, p) => s + quedanDe(p), 0);

/** De qué paquete sale la clase: el más viejo con clases (el que primero se pagó, primero se usa). */
export function elegirPaquete<T extends PaqueteConUso>(ps: readonly T[]): T | null {
  const vivos = ps.filter((p) => quedanDe(p) > 0);
  vivos.sort((a, b) => a.pagadoEl.getTime() - b.pagadoEl.getTime() || a.id.localeCompare(b.id));
  return vivos[0] ?? null;
}

/** Un paquete se anula (venta cargada por error) sólo si todavía no se usó ninguna clase. */
export const puedeAnularPaquete = (p: Pick<PaqueteConUso, "usadas" | "anuladoEl">): boolean => !p.anuladoEl && p.usadas === 0;

/** «Quedan 3 clases» · «Queda 1 clase» · «No le quedan clases». */
export function textoQuedan(n: number): string {
  if (n <= 0) return "No le quedan clases";
  return n === 1 ? "Queda 1 clase" : `Quedan ${n} clases`;
}

// ── Precio por club ─────────────────────────────────────────────────────────

export type ListaDePrecios = { precioIndividual: number; precioGrupal: number };
export type PrecioDeClub = { precioIndividual: number | null; precioGrupal: number | null };

/**
 * La lista que rige para una clase en ese club: lo cargado en el club pisa a la general, campo por
 * campo; lo que el club no tiene (o un club sin precio propio) es el de PadelConfig.
 */
export function listaDelClub<C extends ListaDePrecios>(config: C, club: PrecioDeClub | null | undefined): C {
  if (!club) return config;
  return {
    ...config,
    precioIndividual: club.precioIndividual ?? config.precioIndividual,
    precioGrupal: club.precioGrupal ?? config.precioGrupal,
  };
}

export type PrecioClubValido = { ok: true; precioIndividual: number | null; precioGrupal: number | null } | { ok: false; error: string };

/** Los dos precios del club: vacío = «el de la lista» (null); si no, plata válida (> 0). */
export function precioClubValido(raw: { precioIndividual: unknown; precioGrupal: unknown }): PrecioClubValido {
  const uno = (v: unknown): number | null | "mal" => {
    const l = leerImporte(String(v ?? ""));
    if (l.estado === "vacio") return null;
    if (l.estado !== "ok" || l.valor <= 0 || l.valor > PRECIO_MAXIMO) return "mal";
    return l.valor;
  };
  const i = uno(raw.precioIndividual);
  const g = uno(raw.precioGrupal);
  if (i === "mal") return { ok: false, error: "El precio individual no se entiende. Dejalo vacío para usar el de la lista." };
  if (g === "mal") return { ok: false, error: "El precio grupal no se entiende. Dejalo vacío para usar el de la lista." };
  return { ok: true, precioIndividual: i, precioGrupal: g };
}
