// ============================================================================
// LOS COMANDOS DEL TORNEO — lo único que el navegador puede pedir (nunca manda el estado entero).
// ============================================================================
//
// Cada comando se valida acá (forma y topes), pide un permiso (permisos.ts) y se aplica con el motor del sitio
// sobre la foto vigente. Devuelve el «rastro» (qué partido, antes → después) que queda en la auditoría.
//
// — Elaborado por GSG

import type { PermisoTorneo } from "./permisos";
import type { Destino, Lado, MotorTorneo, Partido, ResultadoPartido, Sets, Torneo } from "./tipos";

export type Comando =
  | { tipo: "resultado"; partidoId: string; sets: Sets }
  | { tipo: "wo"; partidoId: string; perdedor: Lado }
  | { tipo: "borrar"; partidoId: string }
  | { tipo: "reprogramar"; partidoId: string; destino: Destino };

export type TipoDeComando = Comando["tipo"];

export interface Rastro {
  partidoId: string;
  codigo: string;
  categoria: string;
  antes: unknown;
  despues: unknown;
}

const PERMISO: Record<TipoDeComando, PermisoTorneo> = {
  resultado: "resultados",
  wo: "resultados",
  borrar: "gestionar",
  reprogramar: "gestionar",
};

export function permisoQuePide(tipo: TipoDeComando): PermisoTorneo {
  return PERMISO[tipo];
}

const ID = /^\d{1,6}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;
const SEDE = /^[A-Za-z0-9_-]{1,40}$/;

const esEnteroEntre = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function leerSets(v: unknown): Sets | null {
  if (!Array.isArray(v) || v.length < 2 || v.length > 3) return null;
  const sets: Sets = [];
  for (const s of v) {
    if (!Array.isArray(s) || s.length !== 2 || !esEnteroEntre(s[0], 0, 7) || !esEnteroEntre(s[1], 0, 7)) return null;
    sets.push([s[0], s[1]]);
  }
  return sets;
}

/** Lee y valida un comando que llega del navegador. */
export function leerComando(raw: unknown): { ok: true; comando: Comando } | { ok: false; error: string } {
  const c = raw as Record<string, unknown> | null;
  if (!c || typeof c !== "object") return { ok: false, error: "Pedido inválido." };
  const partidoId = typeof c.partidoId === "number" ? String(c.partidoId) : c.partidoId;
  if (typeof partidoId !== "string" || !ID.test(partidoId)) return { ok: false, error: "Falta el partido." };
  switch (c.tipo) {
    case "resultado": {
      const sets = leerSets(c.sets);
      if (!sets) return { ok: false, error: "El resultado tiene que ser de 2 o 3 sets, con games de 0 a 7." };
      return { ok: true, comando: { tipo: "resultado", partidoId, sets } };
    }
    case "wo":
      if (c.perdedor !== "A" && c.perdedor !== "B") return { ok: false, error: "Indicá qué pareja no se presentó." };
      return { ok: true, comando: { tipo: "wo", partidoId, perdedor: c.perdedor } };
    case "borrar":
      return { ok: true, comando: { tipo: "borrar", partidoId } };
    case "reprogramar": {
      const d = c.destino as Record<string, unknown> | null;
      if (!d || typeof d !== "object") return { ok: false, error: "Falta a dónde se reprograma." };
      const cancha = typeof d.cancha === "string" ? Number(d.cancha) : d.cancha;
      if (typeof d.sede !== "string" || !SEDE.test(d.sede)) return { ok: false, error: "Sede inválida." };
      if (!esEnteroEntre(cancha, 1, 30)) return { ok: false, error: "Cancha inválida." };
      if (typeof d.dia !== "string" || !FECHA.test(d.dia)) return { ok: false, error: "Día inválido." };
      if (typeof d.hora !== "string" || !HORA.test(d.hora)) return { ok: false, error: "Hora inválida." };
      return { ok: true, comando: { tipo: "reprogramar", partidoId, destino: { sede: d.sede, cancha, dia: d.dia, hora: d.hora } } };
    }
    default:
      return { ok: false, error: "Acción desconocida." };
  }
}

const copia = <T>(v: T): T => (v == null ? v : (JSON.parse(JSON.stringify(v)) as T));
const lugar = (p: Partido) => ({ sede: p.sede ?? null, cancha: p.cancha ?? null, dia: p.dia ?? null, hora: p.hora ?? null });

/**
 * Aplica el comando sobre `torneo` (lo MUTA: el llamador lo deserializó para esto). Si el motor lo rechaza, devuelve
 * sus mensajes y el llamador descarta el torneo.
 */
export function aplicarComando(
  motor: MotorTorneo,
  torneo: Torneo,
  c: Comando,
): { ok: true; torneo: Torneo; rastro: Rastro; advertencias: string[] } | { ok: false; errores: string[] } {
  const p = torneo.partidos[c.partidoId];
  if (!p) return { ok: false, errores: [`No existe el partido ${c.partidoId} en este torneo.`] };
  const antes = c.tipo === "reprogramar" ? lugar(p) : copia(p.resultado);
  const r =
    c.tipo === "resultado"
      ? motor.cargarResultado(torneo, c.partidoId, { sets: c.sets } as ResultadoPartido)
      : c.tipo === "wo"
        ? motor.marcarWO(torneo, c.partidoId, c.perdedor)
        : c.tipo === "borrar"
          ? motor.borrarResultado(torneo, c.partidoId)
          : motor.reprogramarPartido(torneo, c.partidoId, c.destino);
  // Los arreglos del motor nacen en su contexto de `vm` (otro «reino» de JS): se copian a arreglos de acá.
  if (!r.ok) return { ok: false, errores: r.errores.length ? Array.from(r.errores, String) : ["El motor del torneo rechazó el cambio."] };
  const q = r.torneo.partidos[c.partidoId];
  const despues = c.tipo === "reprogramar" ? lugar(q) : copia(q.resultado);
  return {
    ok: true,
    torneo: r.torneo,
    rastro: { partidoId: c.partidoId, codigo: p.codigo, categoria: p.categoria, antes, despues },
    advertencias: Array.from(r.advertencias ?? [], String),
  };
}
