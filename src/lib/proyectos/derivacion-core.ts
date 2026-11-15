// DERIVACIÓN «MIA Taller / MIA Agencia» (GSG-CRM-010). PURO: sin base ni React.
//
// MIA tiene dos sociedades, cada una con su sistema: el Taller arma stands estandarizables con un
// flujo automático; la Agencia hace todo lo que no se estandariza (activaciones, lanzamientos,
// branding, creatividad, arte, eventos sociales, musicales y deportivos). Los agentes (el «ARM»)
// derivan cada servicio a una u otra. Ante la duda, va a Agencia: rechazo por defecto.

import type { Servicio } from "./core";
import { normalizarDiseno, PIEZAS, type TipoPieza } from "./stand";

export type DestinoUnidad = "TALLER" | "AGENCIA";

/** Nombres de las dos unidades. Provisional a confirmar con MIA. */
export const UNIDAD_LABEL: Record<DestinoUnidad, string> = {
  TALLER: "MIA Taller",
  AGENCIA: "MIA Agencia",
};

/** Piezas de experiencia: no las arma el Taller, son de Agencia. */
export const PIEZAS_EXPERIENCIA: readonly TipoPieza[] = ["PHOTOCALL", "ZONA_PRUEBA", "DESAFIO", "CINTA", "ARCO"];

export interface ReglasTaller {
  /** Superficie máxima del lote, en m². */
  m2Max: number;
  /** Alto máximo de pared, en metros. */
  altoMax: number;
  /** Las piezas que el Taller arma sin diseño a medida. */
  piezasTaller: readonly TipoPieza[];
}

/**
 * Reglas del Taller. TODOS los valores son PROVISIONALES A CONFIRMAR con MIA:
 * - m2Max 18: hasta un 6x3 (provisional a confirmar).
 * - altoMax 3: la pared estándar, sin doble altura (provisional a confirmar).
 * - piezasTaller: todas las de PIEZAS menos las de experiencia (provisional a confirmar).
 */
export const REGLAS_TALLER: ReglasTaller = {
  m2Max: 18,
  altoMax: 3,
  piezasTaller: (Object.keys(PIEZAS) as TipoPieza[]).filter((p) => !PIEZAS_EXPERIENCIA.includes(p)),
};

export interface Derivacion {
  destino: DestinoUnidad;
  motivos: string[];
}

const EPS = 1e-9;
const m = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Un stand: va al Taller sólo si cumple TODAS las reglas. Si no, Agencia, con cada regla que falla. */
export function derivarStand(diseno: unknown, reglas: ReglasTaller = REGLAS_TALLER): Derivacion {
  const d = normalizarDiseno(diseno);
  if (!d) return { destino: "AGENCIA", motivos: ["El diseño no se pudo leer: lo resuelve la Agencia."] };
  const fallas: string[] = [];
  const m2 = d.ancho * d.fondo;
  if (m2 > reglas.m2Max + EPS) fallas.push(`Mide ${m(m2)} m² (${m(d.ancho)} x ${m(d.fondo)}): el Taller arma hasta ${m(reglas.m2Max)} m².`);
  if (d.altoPared > reglas.altoMax + EPS) fallas.push(`La pared tiene ${m(d.altoPared)} m de alto: el Taller arma hasta ${m(reglas.altoMax)} m, sin doble altura.`);
  const fuera = [...new Set(d.piezas.map((p) => p.tipo))].filter((t) => !reglas.piezasTaller.includes(t));
  if (fuera.length > 0) fallas.push(`Lleva piezas que no son del Taller: ${fuera.map((t) => PIEZAS[t].label).join(", ")}.`);
  if (fallas.length > 0) return { destino: "AGENCIA", motivos: fallas };
  return {
    destino: "TALLER",
    motivos: [
      `Mide ${m(m2)} m² (${m(d.ancho)} x ${m(d.fondo)}), dentro de los ${m(reglas.m2Max)} m² del Taller.`,
      `La pared tiene ${m(d.altoPared)} m de alto, dentro de los ${m(reglas.altoMax)} m.`,
      "Todas las piezas son estándar del Taller.",
    ],
  };
}

export interface ParteDerivada extends Derivacion {
  indice: number;
}

export interface DerivacionProyecto {
  destino: DestinoUnidad | "PARTIDO";
  partes: ParteDerivada[];
}

/** Un proyecto: sólo la arquitectura promocional puede ir al Taller; con stands mixtos queda PARTIDO. */
export function derivarProyecto(
  { servicio, stands }: { servicio: Servicio | string; stands: unknown[] },
  reglas: ReglasTaller = REGLAS_TALLER,
): DerivacionProyecto {
  if (servicio !== "ARQUITECTURA") {
    const motivo = "El servicio no es arquitectura promocional: lo resuelve la Agencia.";
    const partes = stands.length > 0 ? stands.map((_, indice) => ({ indice, destino: "AGENCIA" as const, motivos: [motivo] })) : [{ indice: 0, destino: "AGENCIA" as const, motivos: [motivo] }];
    return { destino: "AGENCIA", partes };
  }
  if (stands.length === 0) {
    return { destino: "AGENCIA", partes: [{ indice: 0, destino: "AGENCIA", motivos: ["Falta el diseño del stand: hasta tenerlo, queda en la Agencia."] }] };
  }
  const partes = stands.map((s, indice) => ({ indice, ...derivarStand(s, reglas) }));
  const destinos = new Set(partes.map((p) => p.destino));
  return { destino: destinos.size > 1 ? "PARTIDO" : partes[0].destino, partes };
}

export interface DerivacionConsulta {
  destino: "AGENCIA" | "CANDIDATO_TALLER";
  motivos: string[];
}

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palabras que delatan trabajo de Agencia (ya sin acentos y en minúscula). */
const PALABRAS_AGENCIA: readonly { patron: RegExp; que: string }[] = [
  { patron: /\bactivacion(es)?\b/, que: "activación" },
  { patron: /\blanzamientos?\b/, que: "lanzamiento" },
  { patron: /\bbranding\b/, que: "branding" },
  { patron: /\bexperiencias?\b/, que: "experiencia" },
  { patron: /\bsampling\b/, que: "sampling" },
  { patron: /\b(evento|fiesta)s? (social|sociales|musical|musicales|deportivo|deportivos)\b/, que: "evento social, musical o deportivo" },
  { patron: /\b(casamiento|cumpleanos|recital|concierto|festival|maraton|torneo|carrera)s?\b/, que: "evento social, musical o deportivo" },
  { patron: /\bdoble altura\b/, que: "doble altura" },
];

/**
 * La primera derivación del ARM, con el texto de la consulta y antes de que haya diseño. Sólo un
 * «stand» con medidas «AxB» dentro del máximo es candidato al Taller (pendiente del diseño); todo
 * lo demás va a la Agencia.
 */
export function derivarConsulta(texto: string, reglas: ReglasTaller = REGLAS_TALLER): DerivacionConsulta {
  const t = sinAcentos(texto ?? "");
  const encontradas = [...new Set(PALABRAS_AGENCIA.filter((p) => p.patron.test(t)).map((p) => p.que))];
  if (encontradas.length > 0) return { destino: "AGENCIA", motivos: [`La consulta habla de ${encontradas.join(", ")}: es trabajo de la Agencia.`] };
  if (!/\bstands?\b/.test(t)) return { destino: "AGENCIA", motivos: ["La consulta no pide un stand: la resuelve la Agencia."] };
  const medida = t.match(/(\d+(?:[.,]\d+)?)\s*(?:m\s*)?[x×]\s*(\d+(?:[.,]\d+)?)/);
  if (!medida) return { destino: "AGENCIA", motivos: ["Pide un stand pero sin medidas (AxB): hasta saberlas, queda en la Agencia."] };
  const a = Number(medida[1].replace(",", "."));
  const b = Number(medida[2].replace(",", "."));
  const m2 = a * b;
  if (!Number.isFinite(m2) || m2 <= 0) return { destino: "AGENCIA", motivos: ["Las medidas del stand no se entienden: queda en la Agencia."] };
  if (m2 > reglas.m2Max + EPS) return { destino: "AGENCIA", motivos: [`El stand mide ${m(m2)} m²: el Taller arma hasta ${m(reglas.m2Max)} m².`] };
  return {
    destino: "CANDIDATO_TALLER",
    motivos: [`Stand de ${m(m2)} m², dentro de los ${m(reglas.m2Max)} m² del Taller.`, "Pendiente del diseño: se confirma cuando esté dibujado."],
  };
}
