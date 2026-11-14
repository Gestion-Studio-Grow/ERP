// ============================================================================
// EQUIPO DE AGENTES · reglas del buzón (03 §4.3). PURO: el reloj entra siempre por parámetro.
// ============================================================================
// Estados, plazo, presupuesto de un intento, estado que se muestra pasado el plazo y métricas. Las
// métricas se calculan SOBRE LOS PEDIDOS (AgentePedido es la única fuente), con los abiertos y los
// vencidos sin marcar adentro: contado sobre el registro, un pedido sin cerrar no existiría.

import type { EstadoPedido, Fila, PedidoDelBuzon } from "./tipos";

/** Objetivo de respuesta de fábrica (s). Se cambia por negocio con AgenteAjuste. */
export const OBJETIVO_SEG_DEFECTO = 180;
/** `maxDuration` del panel (provisional, 05 S17). */
export const MAX_DURATION_SEG = 120;
/** Un intento termina este margen antes del plazo… */
export const MARGEN_ANTES_DEL_PLAZO_MS = 10_000;
/** …y nunca pasa de `maxDuration` menos esto. */
export const MARGEN_MAX_DURATION_MS = 15_000;
/** Para tomar (o relanzar) un pedido le tienen que quedar al menos 30 s. */
export const MINIMO_PARA_TOMAR_MS = 30_000;
/** Un pedido RECIBIDO se considera colgado pasados 10 s sin que nadie lo tome. */
export const COLGADO_RECIBIDO_MS = 10_000;
/** Corte de cada llamada al modelo. */
export const CORTE_LLAMADA_MS = 60_000;
/** Largo máximo del texto libre. */
export const TEXTO_MAXIMO = 1000;
/** Pasos de un pedido de texto libre (llamadas al modelo). */
export const PASOS_MAXIMOS = 6;

/** Estados que todavía esperan respuesta de un proceso. EN_BANDEJA no: la contesta una persona. */
export const ESTADOS_TOMABLES: readonly EstadoPedido[] = ["RECIBIDO", "EN_CURSO"];
export const ESTADOS_CERRADOS: readonly EstadoPedido[] = ["RESPONDIDO", "NECESITA_PERSONA", "SIN_RESPONDER"];

export function objetivoDelNegocio(objetivoSeg: number | null | undefined): number {
  return objetivoSeg && Number.isInteger(objetivoSeg) && objetivoSeg >= 30 && objetivoSeg <= 3600 ? objetivoSeg : OBJETIVO_SEG_DEFECTO;
}

/** Todo pedido tiene plazo: `pedidoEl + objetivo`. */
export function venceElDe(pedidoEl: Date, objetivoSeg: number): Date {
  return new Date(pedidoEl.getTime() + objetivoSeg * 1000);
}

/**
 * Hasta cuándo puede trabajar un intento que arranca `ahora`: 10 s antes del plazo y nunca más de
 * `maxDuration − 15 s`. Devuelve `null` si no le alcanza (menos de 30 s de plazo).
 */
export function presupuestoDelIntento(ahora: Date, venceEl: Date, maxDurationSeg = MAX_DURATION_SEG): { hasta: Date; ms: number } | null {
  if (venceEl.getTime() - ahora.getTime() < MINIMO_PARA_TOMAR_MS) return null;
  const hasta = Math.min(venceEl.getTime() - MARGEN_ANTES_DEL_PLAZO_MS, ahora.getTime() + maxDurationSeg * 1000 - MARGEN_MAX_DURATION_MS);
  return { hasta: new Date(hasta), ms: hasta - ahora.getTime() };
}

/** Lo mismo que exige la base al tomar (buzon.server.ts): misma regla, escrita una vez para los tests. */
export function sePuedeTomar(p: Pick<PedidoDelBuzon, "estado" | "tomadoHasta" | "venceEl">, ahora: Date): boolean {
  const tomable = p.estado === "RECIBIDO" || (p.estado === "EN_CURSO" && p.tomadoHasta !== null && p.tomadoHasta.getTime() < ahora.getTime());
  return tomable && p.venceEl.getTime() - ahora.getTime() >= MINIMO_PARA_TOMAR_MS;
}

/** ¿Lo tiene que relanzar el rescate de su dueña? Colgado y con 30 s o más de plazo. */
export function necesitaRescate(p: Pick<PedidoDelBuzon, "estado" | "tomadoHasta" | "venceEl" | "pedidoEl">, ahora: Date): boolean {
  if (p.venceEl.getTime() - ahora.getTime() < MINIMO_PARA_TOMAR_MS) return false;
  if (p.estado === "RECIBIDO") return ahora.getTime() - p.pedidoEl.getTime() > COLGADO_RECIBIDO_MS;
  return p.estado === "EN_CURSO" && p.tomadoHasta !== null && p.tomadoHasta.getTime() < ahora.getTime();
}

/** Nunca figura «en curso» pasado su plazo: el estado que se muestra se calcula con `venceEl`. */
export function estadoMostrado(p: Pick<PedidoDelBuzon, "estado" | "venceEl">, ahora: Date): EstadoPedido {
  if ((p.estado === "RECIBIDO" || p.estado === "EN_CURSO") && ahora.getTime() > p.venceEl.getTime()) return "SIN_RESPONDER";
  return p.estado;
}

export const ETIQUETA_DEL_ESTADO: Readonly<Record<EstadoPedido, string>> = {
  RECIBIDO: "Recibido",
  EN_CURSO: "En curso",
  RESPONDIDO: "Respondido",
  NECESITA_PERSONA: "Necesita una persona",
  SIN_RESPONDER: "Sin responder a tiempo",
  EN_BANDEJA: "Necesita una persona: lo responde alguien de GSG",
};

/** Respondido a tiempo: con hora de respuesta y no después del plazo. */
export function dentroDelObjetivo(p: Pick<PedidoDelBuzon, "respondidoEl" | "venceEl">): boolean {
  return p.respondidoEl !== null && p.respondidoEl.getTime() <= p.venceEl.getTime();
}

export const esPersonaDeGsg = (respondidoPor: string | null): boolean => !!respondidoPor && respondidoPor.startsWith("operator:");

export interface MetricasDelBuzon {
  recibidos: number;
  respondidos: number;
  /** De los que ya tienen resultado o ya pasaron su plazo, cuántos se respondieron a tiempo (0–100, entero). Null si no hay ninguno. */
  porcentajeDentro: number | null;
  /** De los respondidos, en ms. Null si no hay. */
  tiempoMedianoMs: number | null;
  tiempoMaximoMs: number | null;
  sinResponderATiempo: number;
  derivadosAPersona: number;
  enBandeja: number;
  respondidosPorGsg: number;
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 === 1 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
}

/**
 * Las métricas que pidió el dueño, sobre los pedidos del período. Un abierto dentro de su plazo
 * todavía no cuenta en el porcentaje; uno abierto pasado su plazo (también en la bandeja) cuenta
 * fuera del objetivo.
 */
export function metricas(pedidos: readonly Pick<PedidoDelBuzon, "estado" | "pedidoEl" | "venceEl" | "respondidoEl" | "respondidoPor">[], ahora: Date): MetricasDelBuzon {
  let respondidos = 0;
  let dentro = 0;
  let evaluables = 0;
  let sinResponder = 0;
  let derivados = 0;
  let enBandeja = 0;
  let porGsg = 0;
  const tiempos: number[] = [];
  for (const p of pedidos) {
    const estado = estadoMostrado(p, ahora);
    if (estado === "RESPONDIDO") {
      respondidos++;
      evaluables++;
      if (dentroDelObjetivo(p)) dentro++;
      if (p.respondidoEl) tiempos.push(p.respondidoEl.getTime() - p.pedidoEl.getTime());
      if (esPersonaDeGsg(p.respondidoPor)) porGsg++;
    } else if (estado === "SIN_RESPONDER") {
      sinResponder++;
      evaluables++;
    } else if (estado === "NECESITA_PERSONA") {
      derivados++;
      evaluables++;
    } else if (estado === "EN_BANDEJA") {
      enBandeja++;
      if (ahora.getTime() > p.venceEl.getTime()) evaluables++;
    }
  }
  return {
    recibidos: pedidos.length,
    respondidos,
    porcentajeDentro: evaluables === 0 ? null : Math.round((dentro * 100) / evaluables),
    tiempoMedianoMs: mediana(tiempos),
    tiempoMaximoMs: tiempos.length ? Math.max(...tiempos) : null,
    sinResponderATiempo: sinResponder,
    derivadosAPersona: derivados,
    enBandeja,
    respondidosPorGsg: porGsg,
  };
}

// ── Respuestas armadas por el código (03 §4.2): renglones con su origen ────────────────────────

/** Un renglón para la persona: etiquetas, cifras y de dónde salió. El modelo nunca escribe esto. */
export function renglonDeFila(f: Fila): string {
  const nombre = f.etiquetas.filter(Boolean).join(" · ") || f.entidad;
  const cifras = f.cifras.map((c) => c.texto).join(" · ");
  return `- ${nombre}${cifras ? `: ${cifras}` : ""} (Fuente: ${f.origen.etiqueta})`;
}

export function renglonesDeFilas(filas: readonly Fila[]): string {
  return filas.length === 0 ? "- (sin renglones)" : filas.map(renglonDeFila).join("\n");
}

/** Respuesta de un pedido de la lista: título, cantidad y renglones. Sin modelo. */
export function respuestaDeLista(etiqueta: string, filas: readonly Fila[], totales: ReadonlyMap<string, number>, textoImporte: (v: number, m: string) => string): string {
  if (filas.length === 0) return `${etiqueta}: no hay nada para mostrar.`;
  const total = [...totales.entries()].map(([m, v]) => textoImporte(v, m)).join(" + ");
  const cabecera = `${etiqueta}: ${filas.length} ${filas.length === 1 ? "renglón" : "renglones"}${total ? `, total ${total}` : ""}.`;
  return `${cabecera}\n${renglonesDeFilas(filas)}`;
}
