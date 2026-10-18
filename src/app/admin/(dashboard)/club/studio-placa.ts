// ============================================================================
// STUDIO DE REDES — el dibujo de la placa en el lienzo (canvas 2D).
// ============================================================================
//
// El mismo dibujo que el Studio del sistema de hoy (public/previews/breakpoint/club/studio.mjs: `fondo`, `logo`,
// `pastilla`, `titulo`, `parrafo`, `filasDatos`, `precioGrande`, `grillaHorarios`, `CUERPOS`, `dibujarPieza`), con las
// medidas y el partido de renglones de studio-core.ts. Sin React ni DOM: recibe el contexto del lienzo, así el test
// lo corre con un lienzo falso (studio-core.test.ts). Los colores son los de la marca del club en la placa (CLUB).

import { CLAVES_CAMPO, CLUB, PLANTILLAS, ajustarLineas, lineasHorarios, medidasDeLaPlaca, partirLineas, type ClavePlantilla, type Medir, type Valores } from "./studio-core";

const LETRA_TITULO = '"Anton","Archivo Narrow","Arial Narrow",Impact,sans-serif';
const LETRA_TEXTO = 'Montserrat,"Century Gothic","Avenir Next",system-ui,sans-serif';
const BLANCO = "#FFFFFF";

/** Las tipografías de la placa (como las placas del club: Anton, y el logo: Montserrat). Si no cargan, hay respaldo. */
export const FUENTES_DE_LA_PLACA = "https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@500;600;700&display=swap";
export const MUESTRAS_DE_FUENTES = ["40px Anton", "500 40px Montserrat", "700 40px Montserrat"];

/** Una foto ya leída (una <img> cargada, o lo que se pueda dibujar con su tamaño). */
export type FotoDeFondo = CanvasImageSource & { width: number; height: number };

type Ctx = CanvasRenderingContext2D;
type Aviso = { recortado: boolean };
interface Caja {
  x: number;
  y: number;
  ancho: number;
  limite: number;
  historia: boolean;
  aviso: Aviso;
}

const limpio = (s: unknown) => String(s ?? "").trim();

function ponerLetra(ctx: Ctx, letra: string, espaciado = "0px") {
  ctx.font = letra;
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = espaciado;
}
const medidor =
  (ctx: Ctx): Medir =>
  (t) =>
    ctx.measureText(t).width;

function fondo(ctx: Ctx, W: number, H: number, foto: FotoDeFondo | null) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, CLUB.azul);
  g.addColorStop(1, CLUB.azulHondo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (foto && foto.width && foto.height) {
    const r = Math.max(W / foto.width, H / foto.height);
    const w = foto.width * r;
    const h = foto.height * r;
    ctx.drawImage(foto, (W - w) / 2, (H - h) / 2, w, h);
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, "rgba(3,60,120,.72)");
    v.addColorStop(0.5, "rgba(3,50,105,.80)");
    v.addColorStop(1, "rgba(4,32,68,.92)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  // La cancha vista desde arriba, inclinada y cortada: textura de pádel, sin competir con el texto.
  const L = Math.max(W, H) * 1.05;
  const A = L / 2;
  ctx.save();
  ctx.translate(W * 0.86, H * 0.62);
  ctx.rotate(-0.32);
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 7;
  ctx.strokeRect(-A / 2, -L / 2, A, L);
  const servicio = L * 0.3475;
  ctx.beginPath();
  for (const y of [0, -servicio, servicio]) {
    ctx.moveTo(-A / 2, y);
    ctx.lineTo(A / 2, y);
  }
  ctx.moveTo(0, -servicio);
  ctx.lineTo(0, servicio);
  ctx.stroke();
  ctx.restore();
}

/** El logo del club (mismo dibujo que .logo-bp de la portada: caja de 104 × 80), en blanco con la pelota naranja. */
function logo(ctx: Ctx, x: number, y: number, alto: number) {
  const k = alto / 80;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = BLANCO;
  ctx.fillRect(0.5, 3.5, 3.6, 73);
  ponerLetra(ctx, `500 24.5px ${LETRA_TEXTO}`);
  ctx.textBaseline = "alphabetic";
  for (const [t, tx, ty, largo] of [
    ["BREAK", 9.5, 25, 92],
    ["P", 9.5, 51, 15.5],
    ["INT", 45, 51, 56.5],
    ["PADEL", 9.5, 77, 92],
  ] as const) {
    const w = ctx.measureText(t).width || largo;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(largo / w, 1);
    ctx.fillText(t, 0, 0);
    ctx.restore();
  }
  ctx.strokeStyle = CLUB.naranja;
  ctx.lineWidth = 3.3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(35, 42.4, 8.1, 0, Math.PI * 2);
  ctx.stroke();
  if (typeof Path2D === "function") ctx.stroke(new Path2D("M34.2 35.6a7.6 7.6 0 0 0 0 13.6"));
  ctx.restore();
}

function caja(ctx: Ctx, x: number, y: number, w: number, h: number, radio: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, radio);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function pastilla(ctx: Ctx, texto: string, o: { x: number; y: number; alto: number; letra: string; alinear?: "izq" | "der"; anchoMax?: number }) {
  const { x, y, alto, letra, alinear = "izq", anchoMax = Infinity } = o;
  ponerLetra(ctx, letra, "1px");
  const pad = alto * 0.55;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t).width + pad * 2 > anchoMax) t = t.slice(0, -1);
  if (t !== texto) t = `${t.trimEnd()}…`;
  const w = ctx.measureText(t).width + pad * 2;
  const x0 = alinear === "der" ? x - w : x;
  ctx.fillStyle = CLUB.naranja;
  caja(ctx, x0, y, w, alto, alto / 2);
  ctx.fillStyle = BLANCO;
  ctx.textBaseline = "middle";
  ctx.fillText(t, x0 + pad, y + alto / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

/** Título grande en mayúsculas, condensado e inclinado como las placas del club. Achica hasta que entra. */
function titulo(ctx: Ctx, texto: string, c: Caja & { maxAlto: number; tam: number; min: number }) {
  const t = String(texto).toUpperCase();
  let s = c.tam;
  let ls: string[] = [];
  for (;;) {
    ponerLetra(ctx, `${s}px ${LETRA_TITULO}`, "0.5px");
    ls = partirLineas(t, c.ancho - s * 0.25, medidor(ctx));
    if (ls.length * s * 1.02 <= c.maxAlto || s <= c.min) break;
    s -= 6;
  }
  const maxT = Math.max(1, Math.floor(c.maxAlto / (s * 1.02)));
  if (ls.length > maxT) c.aviso.recortado = true;
  ls = ajustarLineas(ls, maxT, c.ancho - s * 0.25, medidor(ctx));
  ctx.fillStyle = BLANCO;
  let base = c.y + s * 0.84;
  for (const l of ls) {
    ctx.save();
    ctx.translate(c.x, base);
    ctx.transform(1, 0, -0.16, 1, 0, 0);
    ctx.fillText(l, 0, 0);
    ctx.restore();
    base += s * 1.02;
  }
  const fin = c.y + ls.length * s * 1.02;
  ctx.fillStyle = CLUB.naranja;
  ctx.fillRect(c.x, fin + 14, 132, 12);
  return fin + 26;
}

/** Párrafo que achica hasta entrar antes de `maxY`; si ni al mínimo entra, corta con «…». Devuelve el y final. */
function parrafo(ctx: Ctx, texto: string, c: Caja & { tam: number; min: number; peso?: number; color?: string; maxY: number }) {
  const { y, maxY, peso = 500, color = BLANCO } = c;
  if (!limpio(texto)) return y;
  if (y >= maxY) {
    c.aviso.recortado = true;
    return y;
  }
  let s = c.tam;
  let ls: string[] = [];
  for (;;) {
    ponerLetra(ctx, `${peso} ${s}px ${LETRA_TEXTO}`);
    ls = partirLineas(texto, c.ancho, medidor(ctx));
    if (y + ls.length * s * 1.32 <= maxY || s <= c.min) break;
    s -= 2;
  }
  const lh = s * 1.32;
  const maxP = Math.max(0, Math.floor((maxY - y) / lh));
  if (ls.length > maxP) c.aviso.recortado = true;
  ls = ajustarLineas(ls, maxP, c.ancho, medidor(ctx));
  ctx.fillStyle = color;
  let base = y + s * 0.95;
  for (const l of ls) {
    ctx.fillText(l, c.x, base);
    base += lh;
  }
  return y + ls.length * lh;
}

function filasDatos(ctx: Ctx, filas: [string, string][], c: Caja & { maxY: number }) {
  const { x, ancho, maxY, historia, aviso } = c;
  let { y } = c;
  const tv = historia ? 46 : 40;
  const tr = historia ? 26 : 24;
  const sep = historia ? 30 : 22;
  ponerLetra(ctx, `700 ${tv}px ${LETRA_TEXTO}`);
  const armar = (max: number) =>
    filas.map(([rotulo, valor]) => {
      const todas = partirLineas(valor, ancho - 30, medidor(ctx));
      return { rotulo, ls: ajustarLineas(todas, max, ancho - 30, medidor(ctx)), corta: todas.length > max };
    });
  const alto = (f: { ls: string[] }) => tr + 10 + f.ls.length * tv * 1.2;
  let filasA = armar(2);
  if (y + filasA.reduce((t, f) => t + alto(f) + sep, 0) > maxY) filasA = armar(1);
  for (const f of filasA) {
    if (y + alto(f) > maxY) {
      aviso.recortado = true;
      break;
    }
    if (f.corta) aviso.recortado = true;
    ctx.fillStyle = CLUB.naranja;
    ctx.beginPath();
    ctx.arc(x + 9, y + tr * 0.5, 9, 0, Math.PI * 2);
    ctx.fill();
    ponerLetra(ctx, `700 ${tr}px ${LETRA_TEXTO}`, "3px");
    ctx.fillStyle = CLUB.celeste;
    ctx.fillText(f.rotulo.toUpperCase(), x + 30, y + tr * 0.85);
    ponerLetra(ctx, `700 ${tv}px ${LETRA_TEXTO}`);
    ctx.fillStyle = BLANCO;
    let base = y + tr + 10 + tv * 0.92;
    for (const l of f.ls) {
      ctx.fillText(l, x + 30, base);
      base += tv * 1.2;
    }
    y += alto(f) + sep;
  }
  return y;
}

/** Precio o descuento gigante, en blanco y subrayado en naranja. */
function precioGrande(ctx: Ctx, precio: string, c: { x: number; y: number; ancho: number; tam: number }) {
  let s = c.tam;
  for (;;) {
    ponerLetra(ctx, `${s}px ${LETRA_TITULO}`, "1px");
    if (ctx.measureText(precio).width <= c.ancho || s <= 60) break;
    s -= 8;
  }
  ctx.fillStyle = BLANCO;
  ctx.fillText(precio, c.x, c.y + s * 0.86);
  const w = Math.min(c.ancho, ctx.measureText(precio).width);
  ctx.fillStyle = CLUB.naranja;
  ctx.fillRect(c.x, c.y + s * 0.86 + 30, w, 14);
  return c.y + s * 0.86 + 44;
}

function grillaHorarios(ctx: Ctx, horarios: string[], c: Caja & { maxY: number }) {
  const { x, y, ancho, maxY, historia, aviso } = c;
  if (!horarios.length) return y;
  const largos = horarios.some((h) => h.length > 6);
  const cols = largos ? 2 : historia ? 3 : 4;
  const gap = 18;
  const alto = historia ? 104 : 92;
  const w = (ancho - gap * (cols - 1)) / cols;
  const filasQueEntran = Math.max(1, Math.floor((maxY - y + gap) / (alto + gap)));
  let lista = horarios;
  if (Math.ceil(lista.length / cols) > filasQueEntran) {
    const lugar = filasQueEntran * cols - 1;
    lista = [...horarios.slice(0, lugar), `+${horarios.length - lugar} más`];
    aviso.recortado = true;
  }
  let s = historia ? 44 : 40;
  ponerLetra(ctx, `700 ${s}px ${LETRA_TEXTO}`);
  while (s > 22 && lista.some((h) => ctx.measureText(h).width > w - 36)) {
    s -= 2;
    ponerLetra(ctx, `700 ${s}px ${LETRA_TEXTO}`);
  }
  lista.forEach((h, i) => {
    const cx = x + (i % cols) * (w + gap);
    const cy = y + Math.floor(i / cols) * (alto + gap);
    ctx.fillStyle = BLANCO;
    caja(ctx, cx, cy, w, alto, 18);
    ctx.fillStyle = CLUB.azul;
    ctx.textBaseline = "middle";
    let t = h;
    while (t.length > 1 && ctx.measureText(t).width > w - 36) t = t.slice(0, -1);
    ctx.fillText(t, cx + 18, cy + alto / 2 + 1);
    ctx.textBaseline = "alphabetic";
  });
  return y + Math.ceil(lista.length / cols) * (alto + gap);
}

const CUERPOS: Record<ClavePlantilla, (ctx: Ctx, v: Valores, c: Caja) => number> = {
  torneo(ctx, v, c) {
    const filas = (
      [
        ["Categorías", v.categorias],
        ["Cuándo", v.cuando],
        ["Inscripción", v.inscripcion],
        ["Premios", v.premio],
      ] as [string, string][]
    ).filter((f) => f[1]);
    // El título cede lugar para que entren todas las filas (antes que el texto opcional).
    const zona = c.limite - c.y;
    const altoFilas = filas.length * (c.historia ? 124 : 106) + (c.historia ? 56 : 34) + 26;
    const maxAlto = Math.min(zona * 0.45, Math.max(zona * 0.2, zona - altoFilas));
    let y = titulo(ctx, v.titulo, { ...c, maxAlto, tam: c.historia ? 150 : 124, min: 56 }) + (c.historia ? 56 : 34);
    y = filasDatos(ctx, filas, { ...c, y, maxY: c.limite });
    return parrafo(ctx, v.texto, { ...c, y: y + 4, tam: c.historia ? 38 : 32, min: 24, color: CLUB.celeste, maxY: c.limite });
  },
  promo(ctx, v, c) {
    let y = titulo(ctx, v.titulo, { ...c, maxAlto: (c.limite - c.y) * 0.36, tam: c.historia ? 140 : 112, min: 56 }) + (c.historia ? 60 : 34);
    if (v.precio) y = precioGrande(ctx, v.precio, { ...c, y, tam: c.historia ? 260 : 200 }) + (c.historia ? 48 : 30);
    if (v.vigencia) y = parrafo(ctx, `Vale ${v.vigencia}`, { ...c, y, tam: c.historia ? 44 : 38, min: 26, peso: 700, maxY: c.limite }) + 18;
    return parrafo(ctx, v.texto, { ...c, y, tam: c.historia ? 38 : 32, min: 24, color: CLUB.celeste, maxY: c.limite });
  },
  turnos(ctx, v, c) {
    let y = titulo(ctx, v.titulo, { ...c, maxAlto: (c.limite - c.y) * 0.3, tam: c.historia ? 150 : 120, min: 56 }) + (c.historia ? 56 : 34);
    const reserva = limpio(v.texto) ? (c.historia ? 120 : 84) : 0;
    y = grillaHorarios(ctx, lineasHorarios(v.horarios), { ...c, y, maxY: c.limite - reserva }) + 12;
    return parrafo(ctx, v.texto, { ...c, y, tam: c.historia ? 38 : 32, min: 24, color: CLUB.celeste, maxY: c.limite });
  },
  novedad(ctx, v, c) {
    const y = titulo(ctx, v.titulo, { ...c, maxAlto: (c.limite - c.y) * 0.5, tam: c.historia ? 150 : 124, min: 60 }) + (c.historia ? 60 : 36);
    return parrafo(ctx, v.texto, { ...c, y, tam: c.historia ? 50 : 42, min: 26, maxY: c.limite });
  },
  buffet(ctx, v, c) {
    let y = titulo(ctx, v.titulo, { ...c, maxAlto: (c.limite - c.y) * 0.42, tam: c.historia ? 140 : 112, min: 56 }) + (c.historia ? 60 : 34);
    if (v.precio) y = precioGrande(ctx, v.precio, { ...c, y, tam: c.historia ? 200 : 150 }) + (c.historia ? 48 : 30);
    return parrafo(ctx, v.texto, { ...c, y, tam: c.historia ? 42 : 36, min: 24, color: CLUB.celeste, maxY: c.limite });
  },
};

/**
 * Dibuja la placa completa en el lienzo del contexto (le ajusta el tamaño al formato).
 * `recortado`: algún texto no entró entero (se cortó con «…» o quedó afuera).
 */
export function dibujarPieza(ctx: Ctx, pieza: { plantilla: string; formato: string; valores: Partial<Valores>; foto?: FotoDeFondo | null }): { recortado: boolean } {
  const m = medidasDeLaPlaca(pieza.formato);
  const clave: ClavePlantilla = Object.hasOwn(PLANTILLAS, pieza.plantilla) ? (pieza.plantilla as ClavePlantilla) : "novedad";
  const P = PLANTILLAS[clave];
  const W = m.ancho;
  const H = m.alto;
  if (ctx.canvas.width !== W) ctx.canvas.width = W;
  if (ctx.canvas.height !== H) ctx.canvas.height = H;
  const v = Object.fromEntries(CLAVES_CAMPO.map((k) => [k, limpio(pieza.valores?.[k])])) as Valores;
  v.titulo ||= P.nombre;
  const { historia, margen: mx, anchoUtil: ancho, arriba, abajo, altoLogo, altoCta, ctaY } = m;
  const marco = () => {
    fondo(ctx, W, H, pieza.foto ?? null);
    logo(ctx, mx, arriba, altoLogo);
    pastilla(ctx, P.rotulo, { x: W - mx, y: arriba + altoLogo / 2 - 32, alto: 64, letra: `700 30px ${LETRA_TEXTO}`, alinear: "der", anchoMax: ancho - 200 });
    // Pie: usuario y teléfono de reservas (el de la bio del club).
    ponerLetra(ctx, `600 ${historia ? 30 : 26}px ${LETRA_TEXTO}`, "0.5px");
    ctx.fillStyle = CLUB.celeste;
    ctx.textAlign = "left";
    ctx.fillText(CLUB.usuario, mx, abajo);
    ctx.textAlign = "right";
    ctx.fillText(`Reservas: ${CLUB.whatsapp}`, W - mx, abajo);
    ctx.textAlign = "left";
    pastilla(ctx, `${P.cta}  →`, { x: mx, y: ctaY, alto: altoCta, letra: `700 ${historia ? 40 : 36}px ${LETRA_TEXTO}`, anchoMax: ancho });
  };
  let aviso: Aviso = { recortado: false };
  marco();
  const fin = CUERPOS[clave](ctx, v, { x: mx, y: m.cuerpoDesde, ancho, limite: m.cuerpoHasta, historia, aviso });
  // Si sobra mucho aire abajo (historias, textos cortos), se baja el contenido para que quede centrado: 2.ª pasada.
  const sobra = m.cuerpoHasta - fin;
  if (sobra > 60) {
    aviso = { recortado: false };
    marco();
    CUERPOS[clave](ctx, v, { x: mx, y: m.cuerpoDesde + Math.round(sobra * 0.4), ancho, limite: m.cuerpoHasta, historia, aviso });
  }
  return aviso;
}

