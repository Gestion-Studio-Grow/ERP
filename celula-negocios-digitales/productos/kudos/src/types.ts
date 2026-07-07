/**
 * Kudos — Tipos del núcleo.
 * El corazón del producto: tomar (reseña + voz de marca) y producir la respuesta apropiada.
 */

export type Plataforma = "google" | "mercadolibre";

/** Registro de voz de la marca. */
export type Tono = "cercano-informal" | "profesional-calido" | "formal" | "divertido";
export type Trato = "voseo" | "tuteo" | "usted";
export type NivelEmojis = "ninguno" | "pocos" | "abundantes";

/**
 * Kit de voz de marca. Se arma en el onboarding (setup pago) y se inyecta como
 * system prompt CACHEADO (prompt caching de Anthropic) al generar cada respuesta.
 * Es el activo que hace que la respuesta suene a LA marca, no a un bot genérico.
 */
export interface BrandVoice {
  localId: string;
  version: number;
  nombreMarca: string;
  rubro: string;
  tono: Tono;
  trato: Trato;
  firma: string;
  /** Muletillas / expresiones propias de la marca. */
  frasesMarca: string[];
  /** Qué nunca decir (ej. "no mencionar competidores"). */
  prohibiciones: string[];
  /** Si puede ofrecer algo (descuento/reenvío) a un cliente enojado. Por defecto false. */
  permiteCompensacion: boolean;
  emojis: NivelEmojis;
  longitudMax: number;
  /** Canal privado al que derivar quejas. */
  datosContacto: string;
  /** Idioma por defecto; si la reseña está en otro idioma, se responde en ese. */
  idiomaBase: string;
}

/** Una reseña entrante, ya normalizada desde Google o MercadoLibre. */
export interface Review {
  id: string;
  localId: string;
  source: Plataforma;
  autor: string;
  rating: 1 | 2 | 3 | 4 | 5;
  texto: string;
  /** ISO date. */
  fecha: string;
  /** Idioma detectado de la reseña (para responder en el mismo). */
  idioma?: string;
}

/** Cómo termina una reseña procesada. */
export type EstadoRespuesta =
  /** Lista para publicarse automáticamente (positivas/neutras que pasan guardarraíles). */
  | "auto"
  /** Generada pero requiere OK humano antes de publicar (negativas 1-2★). */
  | "revisar_humano"
  /** Tema sensible: NO se publica nada, se alerta al equipo. */
  | "escalar";

export type BucketRating = "negativa" | "neutra" | "positiva";

/** Categorías que fuerzan escalado a humano, sin importar las estrellas. */
export type CategoriaSensible =
  | "legal"
  | "salud_seguridad"
  | "discriminacion"
  | "fraude_robo"
  | "datos_personales"
  | "menores"
  | "fallecimiento";

/** Resultado del núcleo. */
export interface ResultadoRespuesta {
  reviewId: string;
  estado: EstadoRespuesta;
  bucket: BucketRating;
  /** Texto de la respuesta (borrador o final). Puede quedar vacío si se escala sin generar. */
  respuesta: string;
  /** Si se detectó tema sensible, cuál. */
  categoriaSensible?: CategoriaSensible;
  /** Explicación legible del ruteo (para la cola de moderación y auditoría). */
  motivo: string;
  /** Con qué versión del kit de voz se generó. */
  brandVoiceVersion: number;
  /** Quién generó la respuesta (modelo real o mock). */
  generadoPor: string;
  /** Guardarraíles que dispararon (si alguno degradó el estado). */
  advertencias: string[];
}
