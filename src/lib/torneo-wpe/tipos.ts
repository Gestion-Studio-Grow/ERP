// Tipos del motor del torneo WPE (el motor es JS puro dentro del sitio: estos tipos describen sólo lo que se usa).

export type Lado = "A" | "B";
export type Sets = [number, number][];

export interface ResultadoPartido {
  sets: Sets;
  wo?: boolean;
  ganador?: Lado;
  bye?: boolean;
}

export interface Partido {
  id: number | string;
  codigo: string;
  categoria: string;
  fase: "zona" | "llave";
  zona?: string | null;
  ronda?: string | null;
  sede?: string | null;
  cancha?: number | null;
  dia?: string | null;
  hora?: string | null;
  resultado: ResultadoPartido | null;
  _esBye?: boolean;
  _resueltoA?: string | null;
  _resueltoB?: string | null;
  parejaA?: unknown;
  parejaB?: unknown;
}

export interface Jugador {
  nombre?: string;
  apellido?: string;
}

export interface Pareja {
  id: string;
  categoria?: string;
  j1?: Jugador;
  j2?: Jugador;
  ranking?: number;
}

export interface Torneo {
  config: {
    categorias: Record<string, Pareja[]>;
    sedes: { id: string; nombre: string; canchas: number }[];
    dias: { fecha: string; desde: string; hasta: string }[];
    [k: string]: unknown;
  };
  partidos: Record<string, Partido>;
  zonas: Record<string, unknown>;
  llaves: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ResultadoMutacion {
  ok: boolean;
  errores: string[];
  advertencias: string[];
  torneo: Torneo;
}

export interface Destino {
  sede: string;
  cancha: number;
  dia: string;
  hora: string;
}

export interface MotorTorneo {
  version: string;
  CONFIG_DEMO: unknown;
  generarTorneoEnCurso(config: unknown, avance: number, semilla: number): Torneo;
  cargarResultado(t: Torneo, partidoId: string, r: ResultadoPartido): ResultadoMutacion;
  marcarWO(t: Torneo, partidoId: string, perdedor: Lado): ResultadoMutacion;
  borrarResultado(t: Torneo, partidoId: string): ResultadoMutacion;
  reprogramarPartido(t: Torneo, partidoId: string, destino: Destino): ResultadoMutacion;
  serializar(t: Torneo): string;
  deserializar(s: string): Torneo;
}
