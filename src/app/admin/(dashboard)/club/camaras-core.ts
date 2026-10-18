// ============================================================================
// CÁMARAS SIMULADAS — qué muestra cada cámara de la demo. PURO.
// ============================================================================
//
// Paridad con las cámaras del Tablero del sistema de hoy (public/previews/breakpoint/club/app.mjs: `camaras`,
// `tiles`, `dibujar`, `camaraGrande`): una por cancha (la `camara` de la cancha) más recepción y caja, Delicias
// (bar) y el estacionamiento. Cada cámara de cancha dice el turno que está en la cancha y lo que debe. SÓLO en la
// demo: en la jornada real no se muestran (en el club se conecta la grabadora que ya tienen). Decisión del dueño
// (18/10): quedan en el sistema de hoy y se hacen también acá. El dibujo está en camaras-escena.ts.

import { hhmm, pesos, saldo } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";

export type EscenaDeCamara = "cancha" | "recepcion" | "bar" | "estacionamiento";

export interface CamaraDelClub {
  id: string;
  /** «CAM 01». */
  numero: string;
  /** «CAM 01 · Cancha 1». */
  rotulo: string;
  nombre: string;
  escena: EscenaDeCamara;
  /** «Martín Ríos · debe $ 22.275» / «al día» / «Sin juego · luz prendida» / «Sin juego» / «General». */
  pie: string;
  /** El nombre accesible del botón (el lienzo es decorativo). */
  etiqueta: string;
  /** La luz de la cancha (las generales, siempre). */
  luz: boolean;
  /** Cuántos juegan ahora en esa cancha (0 = nadie). */
  jugadores: number;
}

export interface VistaCamaras {
  camaras: CamaraDelClub[];
  /** «2026-10-18 19:10»: el sello de la imagen (el dibujo le suma los segundos). */
  sello: string;
  firma: string;
}

/** Lo que dice el pie de la demo (honesto: es una simulación). */
export const NOTA_DE_LA_DEMO =
  "Simulación de demo. En el club se conecta la grabadora (NVR) que ya tienen: cada cámara se asocia a su cancha y se ve en vivo desde acá, sin abrir otra app.";

const GENERALES: { id: string; nombre: string; escena: Exclude<EscenaDeCamara, "cancha"> }[] = [
  { id: "cam-rec", nombre: "Recepción y caja", escena: "recepcion" },
  { id: "cam-bar", nombre: "Delicias (bar)", escena: "bar" },
  { id: "cam-est", nombre: "Estacionamiento", escena: "estacionamiento" },
];

const dosCifras = (n: number) => String(n).padStart(2, "0");

export function armarCamaras(estado: EstadoClub, ahora: Ahora): VistaCamaras {
  const hoy = ahora.fecha;
  const deCanchas = estado.canchas.map((c) => {
    const r = estado.reservas.find((x) => x.fecha === hoy && x.canchaId === c.id && x.estado === "en_cancha");
    const luz = !!estado.luces[c.id];
    const debe = r ? saldo(r) : 0;
    const pie = r ? `${r.titular} · ${debe > 0 ? `debe ${pesos(debe)}` : "al día"}` : luz ? "Sin juego · luz prendida" : "Sin juego";
    return { id: c.camara ?? `cam-${c.id}`, nombre: c.nombre, escena: "cancha" as const, pie, luz, jugadores: r ? r.jugadores.length : 0 };
  });
  const generales = GENERALES.map((g) => ({ ...g, pie: "General", luz: true, jugadores: 0 }));
  const camaras = [...deCanchas, ...generales].map((c, i) => ({
    ...c,
    numero: `CAM ${dosCifras(i + 1)}`,
    rotulo: `CAM ${dosCifras(i + 1)} · ${c.nombre}`,
    etiqueta: `Cámara ${c.nombre}: ${c.pie}. Ampliar`,
  }));
  const vista = { camaras, sello: `${hoy} ${hhmm(ahora.min)}` };
  return { ...vista, firma: JSON.stringify(vista) };
}

/** Las posiciones de los jugadores en la cancha (de -0,5 a 0,5): dos de cada lado; con 3 se dibujan 4, como el vanilla. */
export function posicionesDeJugadores(n: number): [number, number][] {
  if (n <= 0) return [];
  const todas: [number, number][] = [
    [-0.3, -0.25],
    [-0.3, 0.25],
    [0.3, -0.25],
    [0.3, 0.25],
  ];
  const cuantos = Math.max(2, n);
  return todas.slice(0, cuantos === 3 ? 4 : cuantos);
}

/** Cada cuánto se redibujan las cámaras (como el vanilla: 120 ms, ~8 cuadros por segundo). */
export const CUADRO_MS = 120;
