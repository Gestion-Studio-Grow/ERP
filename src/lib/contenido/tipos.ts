// Contenido — tipos y constantes del motor (PURO, client-safe: sin React, sin Prisma).
// Plan: docs/producto/contenido/PLAN.md §1.

/** Fecha local «YYYY-MM-DD» (string, nunca Date: sin corrimientos de zona horaria). */
export type Fecha = string;

export type TipoDeContenido = "promo" | "horario" | "evento" | "novedad" | "servicio";
export const TIPOS: readonly TipoDeContenido[] = Object.freeze(["promo", "horario", "evento", "novedad", "servicio"]);
export const NOMBRE_TIPO: Readonly<Record<TipoDeContenido, string>> = Object.freeze({
  promo: "Promo",
  horario: "Horarios",
  evento: "Torneo o evento",
  novedad: "Novedad",
  servicio: "Servicio nuevo",
});

export type Canal = "instagram" | "historia" | "whatsapp";
export const CANALES: Readonly<Record<Canal, string>> = Object.freeze({
  instagram: "Instagram",
  historia: "Historia",
  whatsapp: "WhatsApp",
});

export type EstadoPublicacion = "borrador" | "programado" | "publicado";
/** Etiqueta y símbolo de cada estado (nunca sólo el color). */
export const ESTADOS: Readonly<Record<EstadoPublicacion, { etiqueta: string; simbolo: string }>> = Object.freeze({
  borrador: { etiqueta: "Borrador", simbolo: "○" },
  programado: { etiqueta: "Programado", simbolo: "◷" },
  publicado: { etiqueta: "Publicado", simbolo: "✔" },
});

export type ClaveFormato = "post" | "historia";
export interface Formato {
  nombre: string;
  ancho: number;
  alto: number;
}
export const FORMATOS: Readonly<Record<ClaveFormato, Formato>> = Object.freeze({
  post: { nombre: "Post", ancho: 1080, alto: 1350 },
  historia: { nombre: "Historia", ancho: 1080, alto: 1920 },
});
export const esFormato = (f: unknown): f is ClaveFormato => f === "post" || f === "historia";
export const esTipo = (t: unknown): t is TipoDeContenido => typeof t === "string" && (TIPOS as readonly string[]).includes(t);
export const esCanal = (c: unknown): c is Canal => c === "instagram" || c === "historia" || c === "whatsapp";
export const esEstado = (e: unknown): e is EstadoPublicacion => e === "borrador" || e === "programado" || e === "publicado";

/** Lo que la placa necesita de la marca del negocio (sale de `marcaDeLaPlaca`). */
export interface MarcaDeLaPlaca {
  nombre: string;
  monograma: string;
  colorPrimario: string;
  colorHondo: string;
  colorAcento: string;
  colorClaro: string;
  /** Sólo dígitos (formato wa.me). */
  whatsapp?: string;
  /** Usuario sin «@». */
  instagram?: string;
}

export interface Deteccion {
  tipo: TipoDeContenido;
  /** 0 a 1. */
  confianza: number;
  /** Lo que se encontró en el texto («2x1», «lunes a viernes»…). */
  pistas: string[];
}

export interface Extraccion {
  titulo: string;
  bajada: string;
  cta: string;
  /** «dd/mm». */
  fecha?: string;
  /** «hh:mm» o «de 10 a 16». */
  hora?: string;
  /** «2x1», «20%», «$ 15.000». */
  precio?: string;
}

export type Variante = "bloque" | "franja" | "tarjeta";

export interface CamposDeLaPieza {
  rotulo: string;
  titulo: string;
  bajada: string;
  cta: string;
}

export interface Captions {
  instagram: string;
  whatsapp: string;
}

export interface PiezaPropuesta {
  plantilla: string;
  tipo: TipoDeContenido;
  variante: Variante;
  formato: ClaveFormato;
  campos: CamposDeLaPieza;
  caption: Captions;
}

/** Una publicación agendada (espejo del modelo `PublicacionAgendada` sin `tenantId`). */
export interface Publicacion {
  id: string;
  fecha: Fecha;
  /** «HH:mm». */
  hora: string;
  canal: Canal;
  estado: EstadoPublicacion;
  tipo: TipoDeContenido;
  plantilla: string;
  formato: ClaveFormato;
  titulo: string;
  texto: string;
  campos: CamposDeLaPieza;
  caption: Captions;
  creadaEn?: string;
  actualizadaEn?: string;
}
