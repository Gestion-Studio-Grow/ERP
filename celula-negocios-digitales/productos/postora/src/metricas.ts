// Postora — atribución de resultados y "Reporte de Resultados" mensual.
//
// ESTE MÓDULO ES EL ANTÍDOTO AL CHURN. El red-team fue claro: "posteos lindos" sin ROI medible
// = discusión de valor eterna y baja a los 60 días. La respuesta de Postora es la MISMA jugada
// que hace fuerte a Kudos (estrellas→ventas) y a Fantasma (plata rescatada): atar el contenido
// a una métrica de negocio y entregar un reporte que el dueño mira y siente.
//
// Cada posteo lleva un `tag` (ver generador.ts). Cuando entra una conversación de WhatsApp con
// ese tag, o el vecino usa un código de promo, se atribuye al posteo. El reporte cierra el
// círculo: alcance → clics → conversaciones → ventas atribuidas.

import type { PlanMensual, PostGenerado } from "./tipos.ts";

/** Un evento de resultado atribuible a un posteo (viene del webhook de WhatsApp o del POS). */
export interface EventoAtribucion {
  tag: string; // el tag del posteo que lo originó
  tipo: "click" | "conversacion" | "venta";
  montoUsd?: number; // solo en ventas
}

export interface ResultadoPorPost {
  tag: string;
  fecha: string;
  objetivo: string;
  clics: number;
  conversaciones: number;
  ventas: number;
  ventasUsd: number;
}

export interface ReporteResultados {
  negocio: string;
  periodo: string;
  postsPublicados: number;
  clics: number;
  conversaciones: number;
  ventas: number;
  ventasAtribuidasUsd: number;
  // Tasa de conversación por posteo — la métrica que el dueño entiende ("cuántos me escribieron").
  conversacionesPorPost: number;
  topPosts: ResultadoPorPost[]; // los que más movieron, para repetir la fórmula
}

/**
 * Cruza el plan con los eventos atribuidos y arma el reporte del mes.
 * Es honesto: "ventas atribuidas" es lo declarado por el vecino (código/‌"¿cómo nos conociste?"),
 * marcado como atribuido, sin sobre-prometer causalidad — evita la fricción de atribución.
 */
export function armarReporte(
  plan: PlanMensual,
  eventos: EventoAtribucion[],
): ReporteResultados {
  const porTag = new Map<string, ResultadoPorPost>();
  for (const post of plan.posts) {
    porTag.set(post.cta.tag, {
      tag: post.cta.tag,
      fecha: post.fecha,
      objetivo: post.objetivo,
      clics: 0,
      conversaciones: 0,
      ventas: 0,
      ventasUsd: 0,
    });
  }

  for (const ev of eventos) {
    const r = porTag.get(ev.tag);
    if (!r) continue; // evento de un posteo que no es de este plan → se ignora
    if (ev.tipo === "click") r.clics += 1;
    else if (ev.tipo === "conversacion") r.conversaciones += 1;
    else if (ev.tipo === "venta") {
      r.ventas += 1;
      r.ventasUsd += ev.montoUsd ?? 0;
    }
  }

  const filas = [...porTag.values()];
  const clics = filas.reduce((s, r) => s + r.clics, 0);
  const conversaciones = filas.reduce((s, r) => s + r.conversaciones, 0);
  const ventas = filas.reduce((s, r) => s + r.ventas, 0);
  const ventasAtribuidasUsd = filas.reduce((s, r) => s + r.ventasUsd, 0);
  const postsPublicados = plan.posts.length;

  const topPosts = [...filas]
    .sort((a, b) => b.conversaciones + b.ventas - (a.conversaciones + a.ventas))
    .slice(0, 3);

  return {
    negocio: plan.kit.negocio,
    periodo: plan.periodo,
    postsPublicados,
    clics,
    conversaciones,
    ventas,
    ventasAtribuidasUsd,
    conversacionesPorPost:
      postsPublicados > 0 ? conversaciones / postsPublicados : 0,
    topPosts,
  };
}

/** Cuántas imágenes IA usa un plan (para el billing de créditos). */
export function contarImagenesIA(posts: PostGenerado[]): number {
  return posts.filter((p) => p.usaImagenIA).length;
}
