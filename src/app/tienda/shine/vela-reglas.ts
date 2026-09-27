// ============================================================================
// LA VELA DE SHINE — reglas puras de la escena 3D (sin three, sin React, sin navegador).
// ============================================================================
//
// Lo que decide la escena y se puede probar sin GPU: el tono de la cera según el aroma elegido,
// qué se anima y qué no con movimiento reducido, cuándo tiene que correr el bucle de cuadros y
// cuándo bajar de resolución. La escena (vela-escena.ts) y su envoltorio (EscenaVela.tsx) sólo consultan.

/**
 * La cera de las fotos del catálogo de Shine (public/tenants/shinevelas/mundo-velas.jpg y hero.jpg):
 * soja color miel, más honda abajo y clara arriba, donde la llama la atraviesa. Promedio medido
 * sobre la foto (#cf8d33 en el cuerpo, #e6c084 en el borde de arriba), llevado a color de material
 * (sin la sombra de la foto). Es el tono con el que nace la escena, sin aroma elegido.
 */
export const CERA_DEL_CATALOGO = "#e3a24e";

/**
 * Tono de la cera por aroma de temporada (los de storefront.ts → gourmetItems).
 * [A VALIDAR con Shine] Las fotos del catálogo muestran cera miel y cera crema, no un color por
 * aroma: estos tonos son ILUSTRATIVOS, derivados de la paleta de la soja (miel, crema, arena,
 * ámbar) con un matiz del aroma. La pantalla lo dice ("color ilustrativo"). Si Shine confirma los
 * colores reales, se cambian acá y en ningún otro lado.
 */
export const TINTE_POR_AROMA: Readonly<Record<string, string>> = {
  "vainilla y canela": "#dfa257",
  "flor de naranjo": "#f0c48a",
  sandalo: "#caa27a",
  lavanda: "#c8b2d4",
  "coco y vainilla": "#efe3cb",
  jazmin: "#f2ebdc",
  "cedro y ambar": "#c47f30",
};

/** "Sándalo" → "sandalo" (sin tildes ni mayúsculas ni espacios de más). */
export function claveDeAroma(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** El tono de la cera para un aroma; sin aroma o con uno que no está en la tabla, la cera del catálogo. */
export function tinteDeAroma(nombre: string | null | undefined): string {
  if (!nombre) return CERA_DEL_CATALOGO;
  return TINTE_POR_AROMA[claveDeAroma(nombre)] ?? CERA_DEL_CATALOGO;
}

/** Qué se anima. Con movimiento reducido: un cuadro quieto, sin humo, sin encendido animado. */
export type PlanDeEscena = {
  /** Hay bucle de cuadros (llama que titila, humo, cámara con resorte). */
  bucle: boolean;
  /** Al apagar sale el hilo de humo. */
  humo: boolean;
  /** La llama nace de a poco al cargar y al volver a encender. */
  transiciones: boolean;
};

export function planDeEscena(movimiento: boolean): PlanDeEscena {
  return movimiento ? { bucle: true, humo: true, transiciones: true } : { bucle: false, humo: false, transiciones: false };
}

/**
 * ¿Tiene que correr el bucle de cuadros? Nunca fuera de pantalla ni con la pestaña oculta (batería
 * del teléfono). En pantalla, sólo si algo se mueve: la llama prendida, humo en el aire, una
 * transición a medio camino o la cámara todavía acomodándose. Apagada y quieta, la escena no gasta
 * un cuadro: el último queda pintado.
 */
export function bucleNecesario(e: {
  movimiento: boolean;
  enPantalla: boolean;
  pestanaVisible: boolean;
  encendida: boolean;
  humoEnElAire: boolean;
  enTransicion: boolean;
  camaraMoviendose: boolean;
}): boolean {
  if (!e.movimiento || !e.enPantalla || !e.pestanaVisible) return false;
  return e.encendida || e.humoEnElAire || e.enTransicion || e.camaraMoviendose;
}

/** Cuadros que se miden antes de decidir la calidad, y el tope de un cuadro "rápido" (18 ms ≈ 55 fps). */
export const CUADROS_A_MEDIR = 40;
export const TOPE_MS_POR_CUADRO = 18;

/** Pasos de calidad: 0 = completa; 3 = la más liviana. */
export type PasoDeCalidad = 0 | 1 | 2 | 3;

/**
 * Qué cambia en cada paso. Ninguno recompila shaders (el vidrio liviano del paso 3 se compila junto
 * con todo, antes del primer cuadro): bajar de paso no da tirones.
 *   · densidad: tope de píxeles por píxel CSS (se aplica de a poco, sin salto visible);
 *   · transmision: resolución del pase que refracta a través del vidrio;
 *   · vidrioFisico: false = vidrio sin transmisión (reflejos y transparencia, sin refracción).
 */
export function ajustesDelPaso(paso: PasoDeCalidad, dprTope: number): { densidad: number; transmision: number; vidrioFisico: boolean } {
  switch (paso) {
    case 0:
      return { densidad: dprTope, transmision: 1, vidrioFisico: true };
    case 1:
      return { densidad: Math.min(dprTope, 1.25), transmision: 0.5, vidrioFisico: true };
    case 2:
      return { densidad: Math.min(dprTope, 1), transmision: 0.35, vidrioFisico: true };
    default:
      return { densidad: Math.min(dprTope, 0.75), transmision: 0.35, vidrioFisico: false };
  }
}

/**
 * Baja de calidad automática, en 3 pasos: si el promedio de los cuadros medidos pasa del tope, un
 * paso más liviano. Nunca sube: un equipo que anduvo lento no se vuelve a probar en la misma visita.
 */
export function pasoDeEconomia(msPorCuadro: number, pasoActual: PasoDeCalidad): PasoDeCalidad {
  if (msPorCuadro <= TOPE_MS_POR_CUADRO || pasoActual === 3) return pasoActual;
  return (pasoActual + 1) as PasoDeCalidad;
}

/**
 * El titileo de la llama (y de su luz, con el MISMO valor): ruido de valor en 1D, tres octavas, más
 * alguna ráfaga ocasional. Orgánico, no una suma de senos. Determinista (mismo t, mismo valor).
 * Devuelve un factor alrededor de 1, entre 0,764 y 1,11 (el ruido mueve ±0,11 y la ráfaga resta hasta 0,126).
 */
export function titileo(t: number): number {
  const fbm = 0.55 * ruido1(t * 5.3) + 0.3 * ruido1(t * 11.7 + 17.1) + 0.15 * ruido1(t * 23.9 + 41.3);
  // Ráfaga: cada tanto el aire mueve la llama y baja un poco la luz.
  const rafaga = Math.max(0, ruido1(t * 0.9 + 7.7) - 0.72) * 0.45;
  return 1 + (fbm - 0.5) * 0.22 - rafaga;
}

function hash1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Ruido de valor 1D suavizado, en 0..1. */
export function ruido1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

/** Texto del botón y del aviso para lectores de pantalla, según el estado de la vela. */
export function textoDelBoton(encendida: boolean): string {
  return encendida ? "Apagar la vela" : "Encender la vela";
}

export function avisoDelEstado(encendida: boolean): string {
  return encendida ? "La vela está encendida." : "La vela está apagada.";
}
