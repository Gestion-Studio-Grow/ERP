// ============================================================================
// EL DESPIECE DE MARCA — la lámina de carnicería de MAGRA, en dato (sin React).
// ============================================================================
//
// Una ilustración a trazo, en oro sobre carbón, de la vaca, el cerdo y el pollo de perfil mirando a
// la izquierda (fronts/magra/DISENO.md §7.3). Cada animal vive en una caja de 1000×560: las regiones
// son polígonos cerrados (los que se tocan y filtran la carta) y el resto del dibujo —cabeza, patas,
// cola— es trazo sin interacción. Lo dibujó el constructor del front: es ilustración de marca, no una
// lámina técnica; los límites entre cortes son los de la carnicería argentina, simplificados.
//
// Qué corte cae en qué región lo decide `regionDeCorte` (src/tenants/magra-content.ts).

import type { MagraAnimal } from "@/tenants/magra-content";

export type Punto = readonly [number, number];

export type Region = {
  id: string;
  /** Cómo la nombra la carnicería («Vacío», «Aguja · bife ancho»). */
  nombre: string;
  /** Polígono en la caja de 1000×560. Sin polígono = región sólo de chip («De varias partes»). */
  puntos: readonly Punto[] | null;
  /** Dónde va el rótulo; si no, el centro del polígono. `null` = sin rótulo en el dibujo (chica). */
  rotulo?: Punto | null;
};

export type Animal = {
  id: MagraAnimal;
  nombre: string;
  regiones: readonly Region[];
  /** Cabeza, patas, cola, ojo: trazo sin interacción. */
  trazo: string;
};

export const CAJA = { ancho: 1000, alto: 560 } as const;

const VACA: Animal = {
  id: "vaca",
  nombre: "Vaca",
  regiones: [
    { id: "cogote", nombre: "Cogote", puntos: [[205, 205], [262, 172], [330, 160], [330, 272], [250, 318], [205, 300]], rotulo: [268, 238] },
    { id: "aguja", nombre: "Aguja · bife ancho", puntos: [[330, 160], [470, 156], [470, 262], [330, 272]] },
    { id: "lomo", nombre: "Bife angosto · lomo", puntos: [[470, 156], [630, 156], [632, 256], [470, 262]] },
    { id: "cuadril", nombre: "Cuadril", puntos: [[630, 156], [745, 146], [768, 240], [632, 256]] },
    { id: "nalga", nombre: "Nalga", puntos: [[745, 146], [818, 162], [850, 205], [852, 300], [812, 385], [745, 398], [725, 330], [768, 240]], rotulo: [800, 270] },
    { id: "pecho", nombre: "Pecho · falda", puntos: [[205, 300], [250, 318], [330, 272], [345, 350], [350, 398], [290, 400], [228, 365]], rotulo: [282, 352] },
    { id: "costillar", nombre: "Costillar", puntos: [[330, 272], [470, 262], [632, 256], [625, 336], [480, 345], [345, 350]], rotulo: [450, 306] },
    { id: "matambre", nombre: "Matambre", puntos: [[345, 350], [480, 345], [625, 336], [625, 398], [480, 405], [350, 398]] },
    { id: "vacio", nombre: "Vacío", puntos: [[632, 256], [768, 240], [725, 330], [705, 384], [625, 398], [625, 336]], rotulo: [676, 318] },
    { id: "entrana", nombre: "Entraña", puntos: [[560, 282], [606, 278], [610, 306], [566, 312]], rotulo: null },
    { id: "varias", nombre: "De varias partes", puntos: null },
  ],
  trazo: [
    // cabeza, cuerno, oreja y ojo
    "M205 205L172 186L160 168L130 170L104 182L76 230L62 268L70 290L96 300L130 296L170 304L205 300",
    "M160 168L146 138L172 160",
    "M160 190L132 200L152 208",
    "M118 222a5 5 0 1 0 0.1 0",
    // patas
    "M268 400L262 528L292 528L300 470L318 399",
    "M322 399L328 470L324 524L352 524L354 470L350 398",
    "M745 398L742 470L752 528L784 528L790 470L812 385",
    "M705 386L700 470L708 524L734 524L738 470L745 398",
    // cola
    "M850 205C880 232 884 300 872 360L862 396M872 360L882 396",
  ].join(" "),
};

const CERDO: Animal = {
  id: "cerdo",
  nombre: "Cerdo",
  regiones: [
    { id: "bondiola", nombre: "Cabeza · bondiola", puntos: [[240, 215], [300, 192], [400, 184], [405, 298], [310, 300], [330, 362], [325, 420], [262, 405], [238, 370]], rotulo: [312, 250] },
    { id: "carre", nombre: "Carré · solomillo", puntos: [[400, 184], [600, 180], [700, 186], [690, 292], [405, 298]] },
    { id: "pierna", nombre: "Pierna", puntos: [[700, 186], [760, 198], [815, 235], [832, 290], [820, 350], [775, 420], [705, 415], [700, 360], [690, 292]], rotulo: [762, 300] },
    { id: "costillar", nombre: "Costillar · ribs", puntos: [[310, 300], [405, 298], [690, 292], [700, 360], [330, 362]] },
    { id: "panza", nombre: "Panza · matambrito", puntos: [[330, 362], [700, 360], [705, 415], [600, 428], [420, 428], [325, 420]] },
  ],
  trazo: [
    "M240 215L205 226L170 250L130 268L104 280L100 312L120 322L160 330L200 350L238 370",
    "M104 280L90 284L90 312L100 312",
    "M205 226L216 188L234 220",
    "M162 268a5 5 0 1 0 0.1 0",
    "M296 414L292 522L322 522L332 422",
    "M716 416L712 522L742 522L772 422",
    "M832 286C860 268 874 300 854 306C838 310 844 290 864 288",
  ].join(" "),
};

const POLLO: Animal = {
  id: "pollo",
  nombre: "Pollo orgánico",
  regiones: [
    { id: "pechuga", nombre: "Pechuga · suprema", puntos: [[330, 262], [400, 215], [470, 205], [520, 240], [530, 330], [470, 405], [400, 408], [345, 360]] },
    { id: "pata", nombre: "Pata y muslo", puntos: [[530, 330], [640, 300], [720, 330], [700, 410], [630, 440], [540, 440], [470, 405]] },
    { id: "elaborados", nombre: "Elaborados", puntos: null },
  ],
  trazo: [
    // cuerpo, ala y cola
    "M330 262C350 210 410 196 470 205C560 166 700 182 780 232L836 188L846 252C826 332 766 402 690 432C610 462 480 446 400 408C350 384 322 330 330 262Z",
    "M520 240C590 222 664 240 720 300C660 306 590 304 530 290",
    // cuello, cabeza, pico, cresta y ojo
    "M330 262C312 222 302 184 312 152C320 122 352 112 374 128C388 142 384 172 402 212",
    "M312 152L284 162L310 168",
    "M330 120C328 100 344 98 346 112C350 96 366 100 362 120",
    "M342 142a4 4 0 1 0 0.1 0",
    // patas
    "M566 444L562 512L540 530M562 512L586 530M646 436L650 512L628 530M650 512L674 530",
  ].join(" "),
};

export const ANIMALES: Record<MagraAnimal, Animal> = { vaca: VACA, cerdo: CERDO, pollo: POLLO };

/** `M x y L … Z` de un polígono. */
export function camino(puntos: readonly Punto[]): string {
  return `M${puntos.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
}

/** El centro (promedio de vértices) de un polígono: alcanza para ubicar el rótulo. */
export function centro(puntos: readonly Punto[]): Punto {
  const n = puntos.length;
  const [sx, sy] = puntos.reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
  return [Math.round(sx / n), Math.round(sy / n)];
}

export function regionDe(animal: MagraAnimal, id: string | null): Region | null {
  if (!id) return null;
  return ANIMALES[animal].regiones.find((r) => r.id === id) ?? null;
}

/**
 * La caja 4:5 del mini-despiece de una etiqueta: el dibujo recortado alrededor de la región, que
 * queda en el centro. Sin región (o sin polígono), el animal entero.
 */
export function cajaDelRecorte(animal: MagraAnimal, regionId: string | null): string {
  const r = regionDe(animal, regionId);
  if (!r?.puntos) return ENCUADRE;
  const xs = r.puntos.map((p) => p[0]);
  const ys = r.puntos.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Aire alrededor de la región para que se lea el animal, en proporción 4:5 (ancho:alto).
  let alto = Math.max((y1 - y0) * 2.6, ((x1 - x0) * 2 * 5) / 4, 420);
  alto = Math.min(alto, 600);
  const ancho = (alto * 4) / 5;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return `${Math.round(cx - ancho / 2)} ${Math.round(cy - alto / 2)} ${Math.round(ancho)} ${Math.round(alto)}`;
}

/** El encuadre del animal entero, sin el aire de arriba de la caja (el dibujo va de y≈100 a y≈530). */
export const ENCUADRE = "40 80 880 470";
