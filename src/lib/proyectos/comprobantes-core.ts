// ============================================================================
// Comprobantes de proveedor (MIA-50 T05 · O27, O30, O44). PURO: valida la carga, normaliza el número, decide el
// tratamiento del IVA por línea desde el parámetro `iva.porComprobante` y la marca de sociedad vinculada desde
// `sociedades.vinculadas`. Plata en centavos enteros. Sin consultas: las hace `comprobantes.server.ts`.
// ============================================================================

import { centavosDe } from "@/lib/dinero/redondeo";
import { leerNumero } from "./core";

export type TratamientoIva = "CREDITO" | "COSTO";
export const TRATAMIENTOS: readonly { id: TratamientoIva; label: string }[] = [
  { id: "CREDITO", label: "Crédito fiscal" },
  { id: "COSTO", label: "Suma al costo" },
];
export const esTratamiento = (v: unknown): v is TratamientoIva => v === "CREDITO" || v === "COSTO";

/** Tope del adjunto: el cuerpo de una acción admite 3 MB (next.config). */
export const TOPE_ADJUNTO = 2_500_000;
export const TIPOS_ADJUNTO = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

/** Lo que entra por el formulario (texto argentino: «1.234,56»). */
export const centavosDelTexto = (texto: string): number => centavosDe(leerNumero(texto));
/**
 * El valor de un campo de importe que se vuelve a leer con `centavosDelTexto` (excepción 1 de V3, adenda 1 § A): no es un
 * importe que se muestra, por eso no pasa por `pesos`. Ida y vuelta exacta al centavo (test en t05-comprobantes-core).
 */
export const textoDeCentavos = (c: number): string => (c / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Centavos a pesos, para mostrar con `pesos()`. */
export const aPesosDeCentavos = (c: number | bigint): number => Number(c) / 100;

/**
 * El número del comprobante, normalizado para que «1-234» y «00001-00000234» sean el mismo (la clave anti-duplicado
 * vive en la base sobre este texto). Punto de venta de 5 cifras y número de 8, como los emite ARCA. Sin ese formato
 * (un ticket, un recibo), se guarda en mayúsculas y sin espacios. PURA.
 */
export function normalizarNumero(texto: string): string | null {
  const s = texto.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  const conGuion = /^(\d{1,5})-(\d{1,8})$/.exec(s);
  if (conGuion) return `${conGuion[1].padStart(5, "0")}-${conGuion[2].padStart(8, "0")}`;
  if (/^\d{9,13}$/.test(s)) return `${s.slice(0, -8).padStart(5, "0")}-${s.slice(-8)}`;
  if (/^\d{1,8}$/.test(s)) return `00000-${s.padStart(8, "0")}`;
  if (!/^[A-Z0-9][A-Z0-9./-]{0,39}$/.test(s)) return null;
  return s;
}

export interface CargaComprobante {
  tipo: string;
  numero: string;
  fecha: Date | null;
  netoCentavos: number;
  ivaCentavos: number;
  totalCentavos: number;
}

/**
 * Valida la cabecera. `tipos`: las claves del parámetro `iva.porComprobante` (los tipos que el negocio usa).
 * El total es neto + IVA al centavo, o no entra. PURA.
 */
export function errorDeCarga(c: CargaComprobante, tipos: readonly string[]): string | null {
  if (!tipos.includes(c.tipo)) return "Elegí el tipo de comprobante.";
  if (!c.numero) return "Escribí el número del comprobante (por ejemplo 0001-00001234).";
  if (!c.fecha) return "Elegí la fecha del comprobante.";
  if (!(c.netoCentavos >= 0) || !(c.ivaCentavos >= 0)) return "El neto y el IVA no pueden ser negativos.";
  if (!(c.totalCentavos > 0)) return "El total tiene que ser mayor que cero.";
  if (c.netoCentavos + c.ivaCentavos !== c.totalCentavos) return "El total tiene que ser el neto más el IVA, al centavo. Revisá los tres importes.";
  return null;
}

/**
 * El tratamiento del IVA que corresponde al tipo, según el parámetro del negocio. `provisional` viaja a la línea para que
 * la marca quede en la base (R8). Un tipo que el parámetro no nombra va al costo: es lo prudente (no inventa crédito). PURA.
 */
export function tratamientoDelTipo(tipo: string, porComprobante: Readonly<Record<string, string>>, provisional: boolean): { tratamiento: TratamientoIva; provisional: boolean } {
  const v = porComprobante[tipo];
  return { tratamiento: esTratamiento(v) ? v : "COSTO", provisional };
}

/** Lo que una línea suma al costo: el neto si el IVA es crédito; neto más IVA si va al costo. PURA. */
export const costoDeLinea = (netoCentavos: number, ivaCentavos: number, t: TratamientoIva): number => (t === "COSTO" ? netoCentavos + ivaCentavos : netoCentavos);

/** Proveedor vinculado: su nombre o su CUIT está en `sociedades.vinculadas` (sin mayúsculas, espacios ni guiones). PURA. */
export function esVinculada(proveedor: { name: string; taxId?: string | null }, vinculadas: readonly string[]): boolean {
  const limpio = (s: string) => s.toLowerCase().replace(/[\s.-]/g, "");
  const claves = new Set(vinculadas.map(limpio).filter(Boolean));
  return claves.has(limpio(proveedor.name)) || (!!proveedor.taxId && claves.has(limpio(proveedor.taxId)));
}

/** La referencia entre sociedades: texto libre, el mismo en los dos negocios. PURA. */
export function normalizarReferencia(texto: string): string | null {
  const s = texto.trim().replace(/\s+/g, " ").slice(0, 60);
  return s ? s.toUpperCase() : null;
}

export function errorDeAdjunto(a: { tipo: string; tamano: number } | null): string | null {
  if (!a) return null;
  if (!(TIPOS_ADJUNTO as readonly string[]).includes(a.tipo)) return "El adjunto tiene que ser un PDF o una foto (JPG, PNG o WebP).";
  if (a.tamano > TOPE_ADJUNTO) return "El adjunto pasa los 2,5 MB: achicalo o escanealo de nuevo en menor calidad.";
  if (a.tamano === 0) return "El adjunto está vacío.";
  return null;
}

/** Texto del rechazo del duplicado (la base lo frena con su índice único). */
export const DUPLICADO = "Ese comprobante ya está cargado: el mismo proveedor, tipo y número no entra dos veces. Buscalo en la lista de comprobantes.";

/** «AAAA-MM» válido, o el mes corriente en Argentina. */
export function mesDelParametro(texto: string | null | undefined, hoy: Date = new Date()): string {
  if (texto && /^\d{4}-(0[1-9]|1[0-2])$/.test(texto)) return texto;
  return hoy.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 7);
}
