// Postora — interfaz del LLM y un mock determinista (offline).
//
// El generador (generador.ts) depende de esta interfaz, NO de Claude directamente. Así el
// corazón se desarrolla y se demuestra offline, sin secretos ni gasto de tokens de prod.
// La implementación real vive en llm-claude.ts (excluida del build por defecto).
//
// Nota de routing: el mock simula el uso de tokens con el modelo correcto por paso
// (Haiku en ideación/hashtags, Sonnet en copy) para que el COGS de la demo caiga en rango.

import type {
  BriefMensual,
  IdeaPost,
  KitDeMarca,
  Objetivo,
  UsoLLM,
} from "./tipos.ts";
import { ROUTING, TOPE_OUTPUT_TOKENS_POR_LLAMADA } from "./routing.ts";

export interface RespuestaIdeas {
  ideas: IdeaPost[];
  uso: UsoLLM;
}

export interface RespuestaCopy {
  copy: string;
  hashtags: string[];
  uso: UsoLLM;
}

export interface LLMCliente {
  /** Ideación barata (Haiku): propone ángulos para el mes desde el Kit de Marca. */
  idear(args: {
    brief: BriefMensual;
    kitCacheado: boolean;
  }): Promise<RespuestaIdeas>;

  /** Copy final en voz de marca (Sonnet): caption + hashtags para una idea concreta. */
  redactar(args: {
    kit: KitDeMarca;
    idea: IdeaPost;
    kitCacheado: boolean;
  }): Promise<RespuestaCopy>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock determinista. Sin dependencias, sin red. Reglas por rubro/objetivo + un
// modelo de tokens realista (Kit de Marca grande y cacheado a 0,1×).
// ─────────────────────────────────────────────────────────────────────────────

const TOKENS_KIT = 2500; // Kit de Marca + plantillas: bloque grande y estable → se cachea

function tokensAprox(texto: string): number {
  return Math.max(1, Math.round(texto.length / 4)); // ~1 token / 4 chars (español)
}

/** Ángulos base por rubro — la materia prima de la ideación (voz local, no genérica). */
const ANGULOS: Record<string, { objetivo: Objetivo; angulo: string }[]> = {
  gastronomia: [
    { objetivo: "promo", angulo: "el combo del finde a precio de barrio" },
    { objetivo: "novedad", angulo: "plato nuevo de la semana, foto bien apetitosa" },
    { objetivo: "reserva", angulo: "reservá tu mesa para el finde por WhatsApp" },
    { objetivo: "comunidad", angulo: "la historia de la casa y quién cocina" },
    { objetivo: "recordatorio", angulo: "abrimos hoy, horarios y delivery" },
  ],
  estetica: [
    { objetivo: "promo", angulo: "combo de temporada con seña por WhatsApp" },
    { objetivo: "reserva", angulo: "quedan turnos esta semana, agendá ya" },
    { objetivo: "novedad", angulo: "tratamiento nuevo, antes y después" },
    { objetivo: "comunidad", angulo: "tips de cuidado en casa entre turnos" },
    { objetivo: "recordatorio", angulo: "recordá tu turno y cómo llegar" },
  ],
  indumentaria: [
    { objetivo: "novedad", angulo: "llegó temporada nueva, primeros talles" },
    { objetivo: "promo", angulo: "2x1 en la línea básica por tiempo limitado" },
    { objetivo: "comunidad", angulo: "cómo combinar la prenda de la semana" },
    { objetivo: "recordatorio", angulo: "envíos a todo el barrio, consultá stock" },
    { objetivo: "reserva", angulo: "apartá tu talle por WhatsApp" },
  ],
  almacen: [
    { objetivo: "promo", angulo: "la oferta de la semana en góndola" },
    { objetivo: "recordatorio", angulo: "pedí por WhatsApp y te lo llevamos" },
    { objetivo: "novedad", angulo: "producto nuevo que llegó al almacén" },
    { objetivo: "comunidad", angulo: "atendido por sus dueños, de siempre" },
    { objetivo: "reserva", angulo: "armá tu pedido y coordinamos entrega" },
  ],
  servicios: [
    { objetivo: "promo", angulo: "presupuesto sin cargo esta semana" },
    { objetivo: "reserva", angulo: "agendá una visita por WhatsApp" },
    { objetivo: "comunidad", angulo: "un trabajo terminado, antes y después" },
    { objetivo: "recordatorio", angulo: "cubrimos toda la zona, consultá" },
    { objetivo: "novedad", angulo: "sumamos un servicio nuevo" },
  ],
  otro: [
    { objetivo: "promo", angulo: "la propuesta del mes" },
    { objetivo: "novedad", angulo: "algo nuevo para contar" },
    { objetivo: "reserva", angulo: "escribinos por WhatsApp" },
    { objetivo: "comunidad", angulo: "quiénes somos" },
    { objetivo: "recordatorio", angulo: "horarios y contacto" },
  ],
};

export class LLMMock implements LLMCliente {
  async idear(args: {
    brief: BriefMensual;
    kitCacheado: boolean;
  }): Promise<RespuestaIdeas> {
    const { brief, kitCacheado } = args;
    const base = ANGULOS[brief.kit.rubro] ?? ANGULOS.otro;

    // Mezcla los temas del dueño (si los dio) con los ángulos base del rubro.
    const ideas: IdeaPost[] = [];
    for (let i = 0; i < brief.cantidadPosts; i++) {
      const tema = brief.temas[i % Math.max(1, brief.temas.length)];
      const b = base[i % base.length];
      ideas.push({
        objetivo: b.objetivo,
        angulo: tema ? `${b.angulo} — ${tema}` : b.angulo,
      });
    }

    const promptBrief = tokensAprox(brief.temas.join(" ") + brief.kit.negocio) + 120;
    const output = Math.min(
      TOPE_OUTPUT_TOKENS_POR_LLAMADA,
      ideas.reduce((s, x) => s + tokensAprox(x.angulo), 0) + 40,
    );
    const uso: UsoLLM = {
      modelo: ROUTING.ideacion,
      inputCached: kitCacheado ? TOKENS_KIT : 0,
      inputUncached: (kitCacheado ? 0 : TOKENS_KIT) + promptBrief,
      output,
    };
    return { ideas, uso };
  }

  async redactar(args: {
    kit: KitDeMarca;
    idea: IdeaPost;
    kitCacheado: boolean;
  }): Promise<RespuestaCopy> {
    const { kit, idea, kitCacheado } = args;

    const copy = this.copyEnVozDeMarca(kit, idea);
    const hashtags = this.hashtags(kit, idea);

    const promptIdea = tokensAprox(idea.angulo) + 60;
    const output = Math.min(
      TOPE_OUTPUT_TOKENS_POR_LLAMADA,
      tokensAprox(copy) + tokensAprox(hashtags.join(" ")) + 30,
    );
    const uso: UsoLLM = {
      modelo: ROUTING.copyFinal,
      inputCached: kitCacheado ? TOKENS_KIT : 0,
      inputUncached: (kitCacheado ? 0 : TOKENS_KIT) + promptIdea,
      output,
    };
    return { copy, hashtags, uso };
  }

  private copyEnVozDeMarca(kit: KitDeMarca, idea: IdeaPost): string {
    // Voz criolla, cálida, local — NO jerga de modelo. El tono viene del Kit de Marca.
    const aperturas: Record<Objetivo, string> = {
      promo: `En ${kit.negocio} te armamos algo lindo:`,
      novedad: `¡Novedad en ${kit.negocio}!`,
      reserva: `Che, en ${kit.negocio} te esperamos:`,
      recordatorio: `Pasá por ${kit.negocio} 👋`,
      comunidad: `Un poquito de ${kit.negocio} para vos:`,
    };
    const cuerpo = idea.angulo.charAt(0).toUpperCase() + idea.angulo.slice(1);
    const cierre = kit.ofertaVigente ? ` ${kit.ofertaVigente}.` : "";
    return `${aperturas[idea.objetivo]} ${cuerpo}.${cierre} Te leemos por acá 👇`;
  }

  private hashtags(kit: KitDeMarca, idea: IdeaPost): string[] {
    const zona = "#" + kit.zona.toLowerCase().replace(/\s+/g, "");
    const rubro = "#" + kit.rubro;
    const obj = "#" + idea.objetivo;
    return [...kit.hashtagsBase, zona, rubro, obj].slice(0, 6);
  }
}
