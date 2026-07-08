// Postora — tipos del dominio.
// Postora = el "community manager con IA" del comercio de barrio: arma el plan de contenido
// del mes (calendario de posteos) EN LA MARCA del negocio, y ata cada posteo a una acción
// medible (link de WhatsApp taggeado / código de promo) para poder mostrar ROI.
//
// Tres decisiones de diseño que responden a los 3 desafíos del red-team:
//  1) Comoditización del contenido IA  → el KIT DE MARCA (abajo) manda cada posteo: la
//     curaduría/estética del estudio ES el producto y el moat frente a Canva/Meta genérico.
//  2) Baja paga + churn                → suscripción MP en pesos, sin fricción; y el reporte
//     de resultados que retiene (ver metricas.ts).
//  3) Sin ROI medible                  → cada posteo lleva una acción rastreable (CTA) →
//     "Reporte de Resultados" mensual con clics/conversaciones/ventas atribuidas.

export type Tier = "BARRIO" | "ACTIVO" | "MARCA";

/** Qué modelo de Claude atiende cada paso (ver routing.ts). El routing es clave del margen. */
export type ModeloClaude = "haiku" | "sonnet" | "opus";

/** Rubro del comercio (ajusta plantillas, ideas y tono base). */
export type Rubro =
  | "gastronomia"
  | "estetica"
  | "indumentaria"
  | "almacen"
  | "servicios"
  | "otro";

/** Objetivo comercial de un posteo — de acá sale la CTA rastreable. */
export type Objetivo = "promo" | "novedad" | "reserva" | "recordatorio" | "comunidad";

export type CanalCTA = "whatsapp" | "codigo_promo" | "link_bio";

/**
 * KIT DE MARCA — el bloque grande y estable que se CACHEA (prompt caching 0,1×) y que hace
 * que el contenido salga en la voz/estética del negocio, no genérico. Es el moat.
 */
export interface KitDeMarca {
  negocio: string;
  rubro: Rubro;
  zona: string; // barrio / ciudad — para el tono local (criollo)
  // Identidad visual (design tokens del negocio; alimentan las plantillas, no generación IA).
  paleta: { primario: string; secundario: string; acento: string; fondo: string };
  tipografia: { titulo: string; cuerpo: string };
  // Voz de marca (tono + do/don't) — lo que evita el "posteo de ChatGPT".
  tono: string;
  hacer: string[]; // qué SÍ (ej. "hablar de vos", "emojis con moderación")
  evitar: string[]; // qué NO (ej. "signos de exclamación en cadena", "inglés innecesario")
  hashtagsBase: string[];
  // Datos operativos del negocio (para CTAs reales).
  whatsapp: string; // E.164 sin +, para el link wa.me
  ofertaVigente?: string;
}

/** Una plantilla visual brandeada: se rellena con foto del comercio (COGS de imagen ~0). */
export interface Plantilla {
  id: string;
  nombre: string;
  objetivo: Objetivo;
  // Descripción del layout (no imagen IA): título grande, foto, franja de color de marca, CTA.
  layout: string;
}

/** El pedido: qué querés del mes (temas, cantidad, foco). */
export interface BriefMensual {
  kit: KitDeMarca;
  cantidadPosts: number; // acotado por el tier (tope duro = blindaje de margen)
  temas: string[]; // ideas sueltas del dueño (opcional); si faltan, se generan
  incluirImagenIA: number; // cuántos posts usan generación IA (add-on medido), default 0
}

/** Uso de tokens de una llamada al LLM (base del COGS). */
export interface UsoLLM {
  modelo: ModeloClaude;
  inputUncached: number;
  inputCached: number; // Kit de Marca cacheado (0,1×)
  output: number;
}

/** Salida estructurada de la ideación (Haiku): variantes baratas para elegir. */
export interface IdeaPost {
  objetivo: Objetivo;
  angulo: string; // el "gancho" de la idea
}

/** Un posteo terminado, listo para revisar/publicar. */
export interface PostGenerado {
  fecha: string; // ISO date sugerida en el calendario
  objetivo: Objetivo;
  plantilla: Plantilla;
  copy: string; // caption en la voz de marca (Sonnet)
  hashtags: string[];
  cta: CTARastreable; // ← la acción medible: esto ata el contenido a plata
  usaImagenIA: boolean;
  usos: UsoLLM[]; // tokens consumidos (ideación + copy [+ imagen]) → COGS del post
}

/** La CTA que hace medible el posteo (resuelve "no hay ROI"). */
export interface CTARastreable {
  canal: CanalCTA;
  texto: string; // lo que dice el botón/renglón ("Escribinos por el combo")
  destino: string; // link wa.me taggeado, o código de promo
  tag: string; // identificador de campaña para atribución (ej. "postora-2026-07-p03")
}

/** El plan de contenido del mes (lo que entrega Postora). */
export interface PlanMensual {
  kit: KitDeMarca;
  periodo: string; // YYYY-MM
  posts: PostGenerado[];
  cogsUsd: number; // COGS real del plan (suma de posts) — base del pricing por uso
}
