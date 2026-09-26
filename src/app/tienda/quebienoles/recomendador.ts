// ============================================================================
// «¿NO SABÉS CUÁL ELEGIR?» — tres preguntas y tres perfumes, con el porqué.
// ============================================================================
//
// Las preguntas salen de cómo habla la marca, no de un test de personalidad: su posteo del 14/09
// dice "para todos los días, para una salida, para regalar o simplemente para darte un gustito", y
// la portada del 15/09 ordena el catálogo en dulces / frescos / versátiles / femeninos.
//
// DATO PURO y determinista (mismas respuestas → mismos tres, en el mismo orden): se testea en
// recomendador.test.ts y no depende de React. Recomienda SÓLO lo que se puede pedir hoy (sin
// "sin stock") y sólo perfumes con ficha: no se recomienda algo de lo que no sabemos a qué huele.

import { FAMILIA_POR_ID, aQueHuele, type FamiliaId, type Perfume } from "./perfumes";
import type { Disponibilidad } from "../reglas-tienda";

export type Ocasion = "todos-los-dias" | "salida" | "regalo" | "gustito";
export type Estilo = "dulce" | "fresco" | "versatil" | "floral";
export type ParaQuien = "para-mi" | "el" | "ella";

export type Respuestas = { ocasion: Ocasion; estilo: Estilo; para: ParaQuien };

export const PREGUNTAS = {
  ocasion: {
    titulo: "¿Para cuándo lo querés?",
    opciones: [
      { id: "todos-los-dias", texto: "Para todos los días" },
      { id: "salida", texto: "Para una salida" },
      { id: "regalo", texto: "Para regalar" },
      { id: "gustito", texto: "Para darme un gustito" },
    ],
  },
  estilo: {
    titulo: "¿Qué te tira más?",
    opciones: [
      { id: "dulce", texto: "Algo dulce e intenso" },
      { id: "fresco", texto: "Algo fresco y limpio" },
      { id: "versatil", texto: "Uno que sirva para todo" },
      { id: "floral", texto: "Algo floral y delicado" },
    ],
  },
  para: {
    titulo: "¿Para quién es?",
    opciones: [
      { id: "para-mi", texto: "Sin etiquetas" },
      { id: "el", texto: "Para él" },
      { id: "ella", texto: "Para ella" },
    ],
  },
} as const;

const FAMILIA_DEL_ESTILO: Record<Estilo, FamiliaId> = {
  dulce: "dulces",
  fresco: "frescos",
  versatil: "versatiles",
  floral: "femeninos",
};

// Acordes que acercan un perfume a un estilo aunque su placa sea otra (el Hawas Tropical es fresco
// y dulce; el Afeef es femenino y floral). Suman menos que la familia: la placa manda.
const ACORDES_DEL_ESTILO: Record<Estilo, readonly string[]> = {
  dulce: ["Dulce", "Vainilla", "Gourmand", "Cacao", "Especiado cálido", "Ámbar"],
  fresco: ["Cítrico", "Fresco", "Acuático", "Verde", "Aromático", "Especiado fresco"],
  versatil: ["Amaderado", "Aromático", "Almizclado", "Ámbar"],
  floral: ["Floral", "Frutal", "Polvoroso"],
};

// La ocasión inclina, no decide: de noche tira a lo dulce, el día a día a lo fresco.
const PESO_OCASION: Record<Ocasion, Partial<Record<FamiliaId, number>>> = {
  "todos-los-dias": { frescos: 3, versatiles: 2 },
  salida: { dulces: 3, versatiles: 2 },
  regalo: { versatiles: 2, femeninos: 2, dulces: 1 },
  gustito: { dulces: 2, femeninos: 1 },
};

export type Candidato = {
  id: string;
  name: string;
  price: number | null;
  disponibilidad?: Disponibilidad;
  perfume: Perfume | null;
};

export type Recomendacion = { id: string; perfume: Perfume; porque: string };

function puntaje(p: Perfume, r: Respuestas): number {
  // Para quién: un masculino no se le recomienda "para ella" y al revés. Unisex va para todos.
  if (r.para === "el" && p.genero === "femenino") return -Infinity;
  if (r.para === "ella" && p.genero === "masculino") return -Infinity;
  let s = 0;
  if (p.familia === FAMILIA_DEL_ESTILO[r.estilo]) s += 10;
  s += p.acordes.filter((a) => ACORDES_DEL_ESTILO[r.estilo].includes(a)).length;
  s += PESO_OCASION[r.ocasion][p.familia] ?? 0;
  // Para regalar sin conocer del todo el gusto del otro, lo unisex suma un poco: le queda bien a más gente.
  if (r.ocasion === "regalo" && p.genero === "unisex") s += 1;
  return s;
}

function porque(p: Perfume, r: Respuestas): string {
  const familia = FAMILIA_POR_ID[p.familia];
  const huele = aQueHuele(p);
  const cuando: Record<Ocasion, string> = {
    "todos-los-dias": "Rinde en el día a día",
    salida: "Hecho para salir",
    regalo: "Un regalo que no falla",
    gustito: "Un gustito bien ganado",
  };
  const base = `${cuando[r.ocasion]}: ${familia.bajada.charAt(0).toLowerCase()}${familia.bajada.slice(1)}`;
  return huele ? `${base} Huele a ${huele}.` : base;
}

/**
 * Los `cuantos` mejores para estas respuestas. Sólo perfumes con ficha y que se puedan pedir. A
 * igual puntaje, el más accesible primero (y después el orden de la carta, que es estable).
 */
export function recomendar(candidatos: readonly Candidato[], r: Respuestas, cuantos = 3): Recomendacion[] {
  return candidatos
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.perfume !== null && c.perfume.notas !== null && c.disponibilidad !== "sin-stock" && (c.price ?? 0) > 0)
    .map(({ c, i }) => ({ c, i, s: puntaje(c.perfume as Perfume, r) }))
    .filter((x) => Number.isFinite(x.s))
    .sort((a, b) => b.s - a.s || (a.c.price ?? 0) - (b.c.price ?? 0) || a.i - b.i)
    .slice(0, cuantos)
    .map(({ c }) => ({ id: c.id, perfume: c.perfume as Perfume, porque: porque(c.perfume as Perfume, r) }));
}
