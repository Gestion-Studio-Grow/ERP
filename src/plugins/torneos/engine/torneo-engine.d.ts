/**
 * Typings del motor WPE (`torneo-engine.js` — COPIA VERBATIM del repo `circuito-wpe`,
 * UMD/CommonJS, JS puro ES2018 sin dependencias). Fuente de verdad del comportamiento:
 * el `.js` y sus 76 tests (`./tests`); acá solo se DESCRIBE su superficie para TypeScript.
 *
 * ⚠️ Realidad de runtime: el módulo exporta UN SOLO objeto (`api`) por UMD
 * (`module.exports = api`). NO tiene exports nombrados en runtime. Por eso las funciones
 * viven en el DEFAULT export (el objeto `api`); los `export`s de acá son solo TIPOS
 * (interfaces), que se borran al compilar y no implican nada en runtime.
 *
 *   import motor from "./torneo-engine.js";   // ✅ el objeto api (esModuleInterop)
 *   import type { Torneo } from "./torneo-engine.js"; // ✅ tipo, se borra
 */

export interface Jugador {
  nombre: string;
  apellido: string;
}

export interface Pareja {
  id: string;
  categoria: string;
  j1: Jugador;
  j2: Jugador;
  ranking?: number;
}

export interface Sede {
  id: string;
  nombre: string;
  canchas: number;
  complejoSede?: boolean;
}

export interface Dia {
  fecha: string; // '2026-08-01'
  desde: string; // '08:00'
  hasta: string; // '23:30'
}

export interface Config {
  categorias: { [cat: string]: Pareja[] };
  sedes: Sede[];
  dias: Dia[];
  slotMin: number;
  descansoMin: number;
  clasificanPorZona: number;
  zonaDias: number[];
  llaveDias: number[];
  modo: "patron" | "azar" | "manual";
  semilla: number;
  manual?: { [cat: string]: string[][] };
}

export interface Resultado {
  sets: [number, number][];
  wo?: boolean;
  bye?: boolean;
  ganador: "A" | "B";
}

export type EntradaPartido = string | "BYE" | { seed: string } | { ganadorDe: number };

export interface Partido {
  id: number;
  codigo: string; // 'CA7-018'
  categoria: string;
  fase: "zona" | "llave";
  zona?: string | null; // 'Grupo A'
  ronda: string; // 'RONDA 1' | '8º DE FINAL' | ...
  parejaA: EntradaPartido;
  parejaB: EntradaPartido;
  sede?: string | null;
  cancha?: number | null;
  dia?: string | null;
  hora?: string | null;
  resultado?: Resultado | null;
  // privados útiles para display (estables en el dataset serializado)
  _resueltoA?: EntradaPartido;
  _resueltoB?: EntradaPartido;
  _parejasReales?: string[];
  _ganadorPareja?: string;
  _esBye?: boolean;
  _next?: number | null;
}

export interface FilaTabla {
  id: string;
  Pts: number;
  PJ: number;
  PG: number;
  PP: number;
  SF: number;
  SC: number;
  GF: number;
  GC: number;
  DS: number;
  DG: number;
  pctGames: number;
}

export interface Zona {
  nombre: string; // 'Grupo A'
  parejas: string[];
  partidos: number[];
  _tabla?: FilaTabla[];
  _completa?: boolean;
}

export interface RondaLlave {
  nombre: string; // '8º DE FINAL'
  partidos: number[];
}

export interface Llave {
  rondas: RondaLlave[];
  byes: string[];
  cuadro?: { [letraZona: string]: { p1: "top" | "bottom"; p2: "top" | "bottom" } };
}

export interface Stats {
  totalPartidos: number;
  porCategoria: { [cat: string]: number };
  capacidadSlots?: number;
  slotsUsados?: number;
  ocupacionPct?: number;
}

export interface Torneo {
  config: Config;
  zonas: { [cat: string]: Zona[] };
  llaves: { [cat: string]: Llave };
  partidos: { [id: string]: Partido };
  stats: Stats;
}

export interface EstadoTorneo {
  fase: "inscripcion" | "zonas" | "llave" | "finalizado";
  partidosJugados: number;
  partidosPendientes: number;
  proximosPartidos: number[];
  ultimosResultados: number[];
  campeonesPorCategoria: { [cat: string]: string | null };
}

/**
 * Resultado de toda MUTACIÓN del motor (`cargarResultado`, `reprogramarPartido`,
 * `marcarWO`, `borrarResultado`). Contrato clave para la persistencia: si `ok` es
 * false, el `torneo` NO cambió y NO debe persistirse (ver `../persistence`).
 */
export interface ResultadoMutacion {
  ok: boolean;
  errores: string[];
  advertencias: string[];
  torneo: Torneo;
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: string[];
  advertencias: string[];
  stats: Stats;
}

/** Utilidades internas del motor, expuestas para tests / UI (ver `api._util`). */
export interface UtilMotor {
  repartoZonas(n: number): number[];
  roundRobin<T>(members: T[]): [T, T][][];
  seedPositions(bracketSize: number): number[];
  nombreRondaLlave(equipos: number): string;
  abreviarCategoria(categoria: string): string;
  mulberry32(seed: number): () => number;
  slotsDeDia(dia: { desde: string; hasta: string }, slotMin: number): number[];
  nextPow2(n: number): number;
  validarResultadoInput(input: unknown): { ok: boolean; errores: string[] };
  resolverCategoria(torneo: Torneo, categoria: string): unknown;
}

/**
 * Superficie pública del motor: el objeto `api` que el UMD pone en `module.exports`.
 * Es el DEFAULT export (import default), no hay exports nombrados en runtime.
 */
export interface MotorWPE {
  readonly version: string;
  /** Getter: devuelve una `Config` FRESCA en cada acceso (no compartir referencia). */
  readonly CONFIG_DEMO: Config;
  generarParejas(n: number, categorias: string[], semilla: number): Pareja[];
  crearTorneo(config: Config): Torneo;
  simularResultados(torneo: Torneo, semilla?: number): Torneo;
  validar(torneo: Torneo): ResultadoValidacion;
  generarTorneoEnCurso(config: Config, avance: number, semilla: number): Torneo;
  cargarResultado(
    torneo: Torneo,
    partidoId: number,
    resultado: { sets: [number, number][]; wo?: boolean; ganador?: "A" | "B" },
  ): ResultadoMutacion;
  borrarResultado(torneo: Torneo, partidoId: number): ResultadoMutacion;
  reprogramarPartido(
    torneo: Torneo,
    partidoId: number,
    destino: { sede: string; cancha: number; dia: string; hora: string },
  ): ResultadoMutacion;
  marcarWO(torneo: Torneo, partidoId: number, perdedor: "A" | "B"): ResultadoMutacion;
  estadoTorneo(torneo: Torneo): EstadoTorneo;
  serializar(torneo: Torneo): string;
  deserializar(s: string): Torneo;
  readonly _util: UtilMotor;
}

declare const motor: MotorWPE;
export default motor;
