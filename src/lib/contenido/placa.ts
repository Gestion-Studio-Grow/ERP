// Contenido — la placa en canvas 2D con la marca del negocio (PURO: recibe el contexto, no toca el DOM).
// Toma de club/studio-placa.ts:338 (`dibujarPieza`) el esquema logo → rótulo → cuerpo → llamado → pie y la zona
// segura de la historia; los colores y el monograma salen de la marca. Sin foto en esta tanda.
import { ajustarLineas, partirLineas, type Medir } from "@/app/admin/(dashboard)/club/studio-core";
import { telefonoLegible } from "./caption";
import { contraste, textoSobre, AA } from "./marca";
import { FORMATOS, esFormato, type CamposDeLaPieza, type ClaveFormato, type MarcaDeLaPlaca, type Variante } from "./tipos";

export interface MedidasDeLaPlaca {
  ancho: number;
  alto: number;
  historia: boolean;
  margen: number;
  anchoUtil: number;
  /** Donde arranca el logo y el renglón del pie (dentro de la zona segura). */
  arriba: number;
  abajo: number;
  altoLogo: number;
  altoCta: number;
  ctaY: number;
  cuerpoDesde: number;
  cuerpoHasta: number;
}

/** Historia: Instagram tapa ~250 px arriba (el usuario) y abajo (responder): ahí no va nada. Números del club. */
export function medidasDeLaPlaca(formato: ClaveFormato | string): MedidasDeLaPlaca {
  const F = FORMATOS[esFormato(formato) ? formato : "post"];
  const historia = formato === "historia";
  const margen = 84;
  const arriba = historia ? 240 : 70;
  const abajo = historia ? F.alto - 250 : F.alto - 62;
  const altoLogo = historia ? 124 : 104;
  const altoCta = historia ? 96 : 84;
  const ctaY = abajo - (historia ? 64 : 50) - altoCta;
  return {
    ancho: F.ancho,
    alto: F.alto,
    historia,
    margen,
    anchoUtil: F.ancho - margen * 2,
    arriba,
    abajo,
    altoLogo,
    altoCta,
    ctaY,
    cuerpoDesde: arriba + altoLogo + (historia ? 90 : 48),
    cuerpoHasta: ctaY - (historia ? 64 : 36),
  };
}

/** Lo mínimo del CanvasRenderingContext2D que usa la placa (un contexto real encaja; en los tests, uno falso). */
export interface CtxPlaca {
  canvas?: { width: number; height: number };
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(texto: string, x: number, y: number, anchoMax?: number): void;
  measureText(texto: string): { width: number };
  beginPath?(): void;
  arc?(x: number, y: number, r: number, desde: number, hasta: number): void;
  roundRect?(x: number, y: number, w: number, h: number, radio: number): void;
  fill?(): void;
}

export interface PiezaADibujar {
  variante: Variante;
  formato: ClaveFormato;
  campos: CamposDeLaPieza;
}

const LETRA = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function caja(ctx: CtxPlaca, x: number, y: number, w: number, h: number, color: string, radio = 0) {
  ctx.fillStyle = color;
  if (radio > 0 && ctx.roundRect && ctx.beginPath && ctx.fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radio);
    ctx.fill();
  } else ctx.fillRect(x, y, w, h);
}

function circulo(ctx: CtxPlaca, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  if (ctx.arc && ctx.beginPath && ctx.fill) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** Un texto en una sola línea que entra en `anchoMax` (cortado con «…»). */
function unaLinea(ctx: CtxPlaca, texto: string, anchoMax: number): { texto: string; recortado: boolean } {
  const medir: Medir = (t) => ctx.measureText(t).width;
  const l = ajustarLineas(partirLineas(texto, anchoMax, medir), 1, anchoMax, medir);
  return { texto: l[0] ?? "", recortado: l.length > 0 && l[0] !== texto.trim() };
}

function pastilla(
  ctx: CtxPlaca,
  texto: string,
  o: { x: number; y: number; alto: number; tam: number; fondo: string; anchoMax: number },
): boolean {
  if (!texto.trim()) return false;
  ctx.font = `700 ${o.tam}px ${LETRA}`;
  const relleno = Math.round(o.alto * 0.45);
  const linea = unaLinea(ctx, texto, o.anchoMax - relleno * 2);
  const ancho = Math.min(o.anchoMax, ctx.measureText(linea.texto).width + relleno * 2);
  caja(ctx, o.x, o.y, ancho, o.alto, o.fondo, o.alto / 2);
  ctx.fillStyle = textoSobre(o.fondo);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(linea.texto, o.x + relleno, o.y + o.alto / 2, o.anchoMax - relleno * 2);
  return linea.recortado;
}

interface Parrafo {
  lineas: string[];
  tam: number;
  alto: number;
  recortado: boolean;
}

/** Reparte el texto en renglones bajando la letra hasta `min`; si igual no entra, corta con «…». */
function armarParrafo(
  ctx: CtxPlaca,
  texto: string,
  o: { ancho: number; tam: number; min: number; peso: number; maxLineas: number; altoMax: number; interlinea: number },
): Parrafo {
  const medir: Medir = (t) => ctx.measureText(t).width;
  if (!texto.trim() || o.altoMax <= 0) return { lineas: [], tam: o.tam, alto: 0, recortado: Boolean(texto.trim()) };
  let tam = o.tam;
  let lineas: string[] = [];
  for (; tam >= o.min; tam -= 4) {
    ctx.font = `${o.peso} ${tam}px ${LETRA}`;
    lineas = partirLineas(texto, o.ancho, medir);
    if (lineas.length <= o.maxLineas && lineas.length * tam * o.interlinea <= o.altoMax) break;
  }
  tam = Math.max(tam, o.min);
  ctx.font = `${o.peso} ${tam}px ${LETRA}`;
  const caben = Math.max(0, Math.min(o.maxLineas, Math.floor(o.altoMax / (tam * o.interlinea))));
  const ajustadas = ajustarLineas(lineas, caben, o.ancho, medir);
  return { lineas: ajustadas, tam, alto: ajustadas.length * tam * o.interlinea, recortado: ajustadas.length < lineas.length };
}

function pintarParrafo(ctx: CtxPlaca, p: Parrafo, x: number, y: number, ancho: number, peso: number, color: string) {
  ctx.font = `${peso} ${p.tam}px ${LETRA}`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  p.lineas.forEach((l, i) => ctx.fillText(l, x, y + p.tam * (0.9 + i * (p.alto / p.lineas.length / p.tam)), ancho));
}

/** La tinta del cuerpo: el color preferido si llega a AA sobre el fondo; si no, la tinta neutra. */
const tinta = (preferido: string, fondo: string) => (contraste(preferido, fondo) >= AA ? preferido : textoSobre(fondo));

/**
 * Pinta la placa completa (le ajusta el tamaño al lienzo si lo tiene) en una de las 3 variantes:
 * «bloque» (fondo del color de la marca), «franja» (fondo claro con franja honda) y «tarjeta» (fondo hondo con
 * tarjeta clara). `recortado`: algún texto no entró entero.
 */
export function dibujarPlaca(ctx: CtxPlaca, pieza: PiezaADibujar, marca: MarcaDeLaPlaca): { recortado: boolean } {
  const m = medidasDeLaPlaca(pieza.formato);
  const { ancho: W, alto: H, margen: mx, anchoUtil, historia } = m;
  if (ctx.canvas) {
    if (ctx.canvas.width !== W) ctx.canvas.width = W;
    if (ctx.canvas.height !== H) ctx.canvas.height = H;
  }
  const c = pieza.campos;
  const v: Variante = pieza.variante === "franja" || pieza.variante === "tarjeta" ? pieza.variante : "bloque";
  let recortado = false;

  // Colores por variante: fondo general, fondo del encabezado, fondo del cuerpo y de las pastillas.
  const P = marca.colorPrimario;
  const Hd = marca.colorHondo;
  const Cl = marca.colorClaro;
  const A = marca.colorAcento;
  const esquema = {
    bloque: { fondo: P, cabecera: P, cuerpo: P, mono: Cl, rotulo: Hd, cta: Cl, pie: P, titulo: textoSobre(P) },
    franja: { fondo: Cl, cabecera: Hd, cuerpo: Cl, mono: P, rotulo: P, cta: P, pie: Cl, titulo: tinta(Hd, Cl) },
    tarjeta: { fondo: Hd, cabecera: Hd, cuerpo: Cl, mono: A, rotulo: P, cta: A, pie: Hd, titulo: tinta(Hd, Cl) },
  }[v];

  // Fondo y decorado.
  caja(ctx, 0, 0, W, H, esquema.fondo);
  if (v === "franja") {
    caja(ctx, 0, 0, W, m.cuerpoDesde - 24, Hd);
    caja(ctx, mx - 48, m.cuerpoDesde, 16, m.cuerpoHasta - m.cuerpoDesde, P);
  } else if (v === "tarjeta") {
    caja(ctx, mx / 2, m.cuerpoDesde - 40, W - mx, m.cuerpoHasta - m.cuerpoDesde + 80, Cl, 36);
  }

  // Encabezado: monograma en círculo + nombre del negocio.
  const r = m.altoLogo / 2;
  circulo(ctx, mx + r, m.arriba + r, r, esquema.mono);
  ctx.font = `800 ${Math.round(r * (marca.monograma.length > 1 ? 0.75 : 1))}px ${LETRA}`;
  ctx.fillStyle = textoSobre(esquema.mono);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(marca.monograma, mx + r, m.arriba + r, r * 1.6);
  ctx.font = `700 ${historia ? 40 : 36}px ${LETRA}`;
  const nombre = unaLinea(ctx, marca.nombre, anchoUtil - r * 2 - 28);
  recortado ||= nombre.recortado;
  ctx.fillStyle = textoSobre(esquema.cabecera);
  ctx.textAlign = "left";
  ctx.fillText(nombre.texto, mx + r * 2 + 28, m.arriba + r, anchoUtil - r * 2 - 28);

  // Cuerpo: rótulo, título y bajada; en la historia se centra si sobra aire.
  const altoRotulo = 64;
  const espacio = m.cuerpoHasta - m.cuerpoDesde - altoRotulo - 40;
  const titulo = armarParrafo(ctx, c.titulo, { ancho: anchoUtil, tam: historia ? 112 : 96, min: 56, peso: 800, maxLineas: 4, altoMax: espacio * 0.65, interlinea: 1.08 });
  const bajada = armarParrafo(ctx, c.bajada, { ancho: anchoUtil, tam: historia ? 46 : 40, min: 28, peso: 500, maxLineas: 5, altoMax: espacio - titulo.alto - 32, interlinea: 1.3 });
  recortado ||= titulo.recortado || bajada.recortado;
  const altoCuerpo = altoRotulo + 40 + titulo.alto + (bajada.lineas.length ? 32 + bajada.alto : 0);
  const sobra = m.cuerpoHasta - m.cuerpoDesde - altoCuerpo;
  let y = m.cuerpoDesde + (historia && sobra > 60 ? Math.round(sobra * 0.4) : 0);
  recortado ||= pastilla(ctx, c.rotulo, { x: mx, y, alto: altoRotulo, tam: 30, fondo: esquema.rotulo, anchoMax: anchoUtil });
  y += altoRotulo + 40;
  pintarParrafo(ctx, titulo, mx, y, anchoUtil, 800, esquema.titulo);
  y += titulo.alto + 32;
  pintarParrafo(ctx, bajada, mx, y, anchoUtil, 500, textoSobre(esquema.cuerpo));

  // Llamado y pie (dentro de la zona segura).
  recortado ||= pastilla(ctx, c.cta ? `${c.cta}  →` : "", { x: mx, y: m.ctaY, alto: m.altoCta, tam: historia ? 40 : 36, fondo: esquema.cta, anchoMax: anchoUtil });
  ctx.font = `600 ${historia ? 30 : 26}px ${LETRA}`;
  ctx.fillStyle = textoSobre(esquema.pie);
  ctx.textBaseline = "alphabetic";
  const izquierda = marca.instagram ? `@${marca.instagram}` : marca.nombre;
  const derecha = marca.whatsapp ? `WhatsApp ${telefonoLegible(marca.whatsapp)}` : "";
  const mitad = anchoUtil / 2 - 12;
  ctx.textAlign = "left";
  ctx.fillText(unaLinea(ctx, izquierda, derecha ? mitad : anchoUtil).texto, mx, m.abajo, derecha ? mitad : anchoUtil);
  if (derecha) {
    ctx.textAlign = "right";
    ctx.fillText(unaLinea(ctx, derecha, mitad).texto, W - mx, m.abajo, mitad);
  }
  ctx.textAlign = "left";
  return { recortado };
}
