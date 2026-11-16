// ============================================================================
// LO QUE VE LA PANTALLA DEL TORNEO — una proyección liviana por categoría (no los 720 KB del estado).
// ============================================================================

import type { Pareja, Partido, Torneo } from "./tipos";

export interface PartidoEnVista {
  id: string;
  codigo: string;
  fase: "zona" | "llave";
  grupo: string;
  parejaA: string;
  parejaB: string;
  sede: string | null;
  cancha: number | null;
  dia: string | null;
  hora: string | null;
  /** «6/3 6/4», «W.O.» o null si no se jugó. */
  resultado: string | null;
  ganador: "A" | "B" | null;
  /** Las dos parejas están definidas: se le puede cargar resultado. */
  definido: boolean;
}

export interface VistaDelTorneo {
  categorias: string[];
  categoria: string;
  sedes: { id: string; nombre: string; canchas: number }[];
  dias: string[];
  partidos: PartidoEnVista[];
  jugados: number;
  total: number;
}

const nombre = (p: Pareja | undefined) =>
  p ? [p.j1, p.j2].map((j) => (j ? `${j.nombre ?? ""} ${j.apellido ?? ""}`.trim() : "?")).join(" / ") : "A definir";

function idPareja(v: unknown, resuelto: string | null | undefined): string | null {
  if (resuelto) return resuelto;
  return typeof v === "string" ? v : null;
}

function textoResultado(p: Partido): string | null {
  const r = p.resultado;
  if (!r || r.bye) return null;
  if (r.wo) return "W.O.";
  return r.sets.map((s) => `${s[0]}/${s[1]}`).join(" ");
}

export function vistaDelTorneo(t: Torneo, pedida?: string | null): VistaDelTorneo {
  const categorias = Object.keys(t.config.categorias);
  const categoria = pedida && categorias.includes(pedida) ? pedida : categorias[0] ?? "";
  const parejas = new Map((t.config.categorias[categoria] ?? []).map((p) => [p.id, p]));
  const sedes = new Map(t.config.sedes.map((s) => [s.id, s.nombre]));
  const todos = Object.values(t.partidos);
  const partidos = todos
    .filter((p) => p.categoria === categoria && !p._esBye)
    .map((p): PartidoEnVista => {
      const a = idPareja(p.parejaA, p._resueltoA);
      const b = idPareja(p.parejaB, p._resueltoB);
      return {
        id: String(p.id),
        codigo: p.codigo,
        fase: p.fase,
        grupo: (p.fase === "zona" ? p.zona : p.ronda) ?? "",
        parejaA: a && a !== "BYE" ? nombre(parejas.get(a)) : "A definir",
        parejaB: b && b !== "BYE" ? nombre(parejas.get(b)) : "A definir",
        sede: p.sede ? (sedes.get(p.sede) ?? p.sede) : null,
        cancha: p.cancha ?? null,
        dia: p.dia ?? null,
        hora: p.hora ?? null,
        resultado: textoResultado(p),
        ganador: p.resultado && !p.resultado.bye ? (p.resultado.ganador ?? null) : null,
        definido: !!a && !!b && a !== "BYE" && b !== "BYE" && parejas.has(a) && parejas.has(b),
      };
    });
  const jugables = todos.filter((p) => !p._esBye);
  return {
    categorias,
    categoria,
    sedes: Array.from(t.config.sedes, (s) => ({ id: s.id, nombre: s.nombre, canchas: s.canchas })),
    dias: Array.from(t.config.dias, (d) => d.fecha),
    partidos,
    jugados: jugables.filter((p) => p.resultado).length,
    total: jugables.length,
  };
}
