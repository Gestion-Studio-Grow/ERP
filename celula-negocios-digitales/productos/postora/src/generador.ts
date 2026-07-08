// Postora — el corazón: genera el PLAN MENSUAL de contenido en la voz de marca,
// con cada posteo atado a una acción rastreable (CTA) y con el COGS medido.
//
// Flujo (con routing por paso, ver routing.ts):
//   1) Ideación (Haiku, Kit cacheado) → ángulos para el mes.
//   2) Por cada idea: copy final (Sonnet, Kit cacheado) + plantilla brandeada + CTA rastreable.
//   3) Se calendariza y se mide el COGS real (base del pricing por uso).

import type {
  BriefMensual,
  CTARastreable,
  IdeaPost,
  KitDeMarca,
  PlanMensual,
  Plantilla,
  PostGenerado,
  UsoLLM,
} from "./tipos.ts";
import type { LLMCliente } from "./llm.ts";
import { PLANTILLAS } from "./marca.ts";
import { desglosarCogs } from "./routing.ts";

export class GeneradorPostora {
  private llm: LLMCliente;

  constructor(llm: LLMCliente) {
    this.llm = llm;
  }

  /**
   * Genera el plan del mes. `periodo` en formato YYYY-MM (se pasa desde afuera para no depender
   * de la fecha del sistema; el orden de los posteos es determinista dado el brief).
   */
  async generarPlan(brief: BriefMensual, periodo: string): Promise<PlanMensual> {
    const kit = brief.kit;

    // 1) Ideación barata (Haiku). El Kit de Marca se envía una vez y queda cacheado.
    const { ideas, uso: usoIdeacion } = await this.llm.idear({ brief, kitCacheado: false });

    // 2) Copy final por idea (Sonnet). A partir de la 1ª llamada, el Kit ya está cacheado (0,1×).
    const posts: PostGenerado[] = [];
    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i];
      const kitCacheado = true; // el Kit ya viajó en la ideación → lecturas a 0,1×
      const { copy, hashtags, uso: usoCopy } = await this.llm.redactar({
        kit,
        idea,
        kitCacheado,
      });

      const plantilla = this.elegirPlantilla(idea);
      const usaImagenIA = i < brief.incluirImagenIA; // add-on medido, no ilimitado
      const cta = this.construirCTA(kit, idea, periodo, i);

      const usos: UsoLLM[] = [usoCopy];
      // La ideación es una sola llamada para todo el mes: se prorratea entre los posteos.
      if (i === 0) usos.unshift(usoIdeacion);

      posts.push({
        fecha: this.fechaSugerida(periodo, i, ideas.length),
        objetivo: idea.objetivo,
        plantilla,
        copy,
        hashtags,
        cta,
        usaImagenIA,
        usos,
      });
    }

    const todosLosUsos = posts.flatMap((p) => p.usos);
    const cogsUsd = desglosarCogs(todosLosUsos).costoUsd;

    return { kit, periodo, posts, cogsUsd };
  }

  /** Elige la plantilla brandeada que matchea el objetivo (fallback: la primera). */
  private elegirPlantilla(idea: IdeaPost): Plantilla {
    return PLANTILLAS.find((p) => p.objetivo === idea.objetivo) ?? PLANTILLAS[0];
  }

  /**
   * Construye la CTA RASTREABLE — la pieza que hace medible el posteo (resuelve "sin ROI").
   * El tag identifica la campaña; el link de WhatsApp lo lleva como texto pre-cargado para
   * poder atribuir la conversación al posteo que la originó (ver metricas.ts).
   */
  private construirCTA(
    kit: KitDeMarca,
    idea: IdeaPost,
    periodo: string,
    indice: number,
  ): CTARastreable {
    const tag = `postora-${periodo}-p${String(indice + 1).padStart(2, "0")}`;
    if (idea.objetivo === "promo" && kit.ofertaVigente) {
      // Código de promo: máximo de atribución (el vecino lo nombra al comprar).
      const codigo = `ROLO${(indice + 1) * 5}`;
      return {
        canal: "codigo_promo",
        texto: `Mostrá el código ${codigo} y aprovechá`,
        destino: codigo,
        tag,
      };
    }
    const textoWa = encodeURIComponent(`Hola ${kit.negocio}! Vi el posteo (${tag})`);
    return {
      canal: "whatsapp",
      texto: "Escribinos por WhatsApp 👇",
      destino: `https://wa.me/${kit.whatsapp}?text=${textoWa}`,
      tag,
    };
  }

  /** Distribuye los posteos a lo largo del mes (determinista, sin usar la fecha del sistema). */
  private fechaSugerida(periodo: string, indice: number, total: number): string {
    const [anio, mes] = periodo.split("-").map((n) => parseInt(n, 10));
    const diasMes = new Date(anio, mes, 0).getDate();
    const paso = Math.max(1, Math.floor(diasMes / Math.max(1, total)));
    const dia = Math.min(diasMes, 1 + indice * paso);
    return `${periodo}-${String(dia).padStart(2, "0")}`;
  }
}
