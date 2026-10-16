// Studio de contenido para redes — gestión del club de Break Point Pádel.
// Arma la placa (canvas) con la marca del club, sugiere el caption en criollo, descarga el PNG y manda la pieza
// al calendario de Contenido del club (el club la guarda con su motor: acá no se toca). Todo local: la foto que
// se sube no sale del equipo y no hay red, salvo las tipografías de Google Fonts (si no cargan, hay respaldo).
//
//   import("./studio.mjs").then((m) => m.abrirStudio({ pieza, alGuardar, alCerrar }))
//
// Marca: colores y logo relevados de Instagram y autorizados el 15/10 (docs/tenants/breakpoint/MARCA-INSTAGRAM.md).
// ES module sin dependencias. Lo de arriba de «DOM» es puro y lo cubre src/tenants/breakpoint/studio.test.ts.

/** Datos del club que salen en las placas y en los captions. */
export const CLUB = Object.freeze({
  usuario: "@breakpointpadel_",
  whatsapp: "11 6187-0066",
  azul: "#035BA8",
  azulHondo: "#06386E",
  naranja: "#DC6E22",
  celeste: "#BFD8F2",
});

export const FORMATOS = Object.freeze({
  post: { nombre: "Post cuadrado", ancho: 1080, alto: 1080, canal: "post" },
  vertical: { nombre: "Post vertical", ancho: 1080, alto: 1350, canal: "post" },
  historia: { nombre: "Historia", ancho: 1080, alto: 1920, canal: "historia" },
});

/** Todos los campos posibles; cada plantilla usa algunos. `multi` = textarea. */
export const CAMPOS = Object.freeze({
  titulo: { etiqueta: "Título" },
  categorias: { etiqueta: "Categorías" },
  cuando: { etiqueta: "Fecha y hora del torneo" },
  inscripcion: { etiqueta: "Inscripción" },
  premio: { etiqueta: "Premios" },
  precio: { etiqueta: "Precio o descuento" },
  vigencia: { etiqueta: "Vigencia" },
  horarios: { etiqueta: "Horarios libres (uno por renglón)", multi: true },
  texto: { etiqueta: "Texto", multi: true },
});

export const PLANTILLAS = Object.freeze({
  torneo: {
    nombre: "Torneo", rotulo: "TORNEO", cta: "Anotate por WhatsApp",
    campos: ["titulo", "categorias", "cuando", "inscripcion", "premio", "texto"],
    etiquetas: { titulo: "Nombre del torneo", texto: "Algo más (opcional)" },
    hashtags: ["#TorneoDePadel", "#Padel"],
    ejemplo: {
      titulo: "Torneo relámpago de primavera", categorias: "4ta, 5ta y 6ta · damas y caballeros",
      cuando: "Sábado 8/11 desde las 9", inscripcion: "$24.000 por pareja", premio: "Paletas y kits para los campeones",
    },
    // Sólo de pista (placeholder): con las 4 filas, en el post cuadrado no entra entero.
    pistas: { texto: "Buffet abierto todo el día." },
  },
  promo: {
    nombre: "Promo", rotulo: "PROMO", cta: "Reservá desde el turnero",
    campos: ["titulo", "precio", "vigencia", "texto"],
    etiquetas: { texto: "Detalle (opcional)" },
    hashtags: ["#PromoPadel", "#Padel"],
    ejemplo: { titulo: "Turnos de valle", precio: "2x1", vigencia: "de lunes a viernes, de 10 a 16", texto: "La segunda hora de cancha corre por nuestra cuenta." },
  },
  turnos: {
    nombre: "Turnos libres hoy", rotulo: "HOY", cta: "Reservá desde el turnero",
    campos: ["titulo", "horarios", "texto"],
    etiquetas: { texto: "Texto (opcional)" },
    hashtags: ["#TurnosLibres", "#Padel"],
    ejemplo: { titulo: "Turnos libres hoy", horarios: "10:00 · Cancha 1\n11:30 · Cancha 2\n15:00 · Cancha 1\n17:30 · Cancha 3", texto: "Armá el partido y reservá en un minuto." },
  },
  novedad: {
    nombre: "Novedad del club", rotulo: "NOVEDAD", cta: "Escribinos por WhatsApp",
    campos: ["titulo", "texto"],
    etiquetas: {},
    hashtags: ["#Padel"],
    ejemplo: { titulo: "Escuelita de pádel: arrancan grupos nuevos", texto: "Martes y jueves de 18 a 19, para chicos de 7 a 14. Anotalos por WhatsApp." },
  },
  buffet: {
    nombre: "Buffet · Delicias", rotulo: "DELICIAS BREAK", cta: "Te esperamos en el buffet",
    campos: ["titulo", "precio", "texto"],
    etiquetas: { titulo: "Plato", precio: "Precio", texto: "Descripción (opcional)" },
    hashtags: ["#DeliciasBreak"],
    ejemplo: { titulo: "Milanesa napolitana con papas", precio: "$14.500", texto: "Recién hecha, para después del partido." },
  },
});

const HASHTAGS_CLUB = ["#BreakPointPadel", "#PadelEzeiza"];
const limpio = (s) => String(s ?? "").trim();

/** Horarios de la lista: uno por renglón, sin vacíos (máximo 12). */
export function lineasHorarios(texto) {
  return String(texto ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

/** Une secciones (listas de renglones): renglones vacíos fuera, secciones vacías fuera, una línea en blanco entre secciones. */
function unir(...secciones) {
  return secciones.map((s) => s.filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
}

/**
 * Caption sugerido, en criollo, con llamado a WhatsApp / turnero y 3 a 4 hashtags. PURA.
 * @param {string} plantilla clave de PLANTILLAS
 * @param {Record<string, string>} valores
 */
export function armarCaption(plantilla, valores = {}) {
  const P = PLANTILLAS[plantilla] ?? PLANTILLAS.novedad;
  const v = Object.fromEntries(Object.keys(CAMPOS).map((k) => [k, limpio(valores[k])]));
  const titulo = v.titulo || P.nombre;
  const wa = CLUB.whatsapp;
  const tags = [[...HASHTAGS_CLUB, ...P.hashtags].join(" ")];
  switch (PLANTILLAS[plantilla] ? plantilla : "novedad") {
    case "torneo":
      return unir([`🏆 ${titulo}`],
        [v.categorias && `🎾 Categorías: ${v.categorias}`, v.cuando && `📅 ${v.cuando}`, v.inscripcion && `💸 Inscripción: ${v.inscripcion}`, v.premio && `🥇 Premios: ${v.premio}`],
        [v.texto], [`¿Vas a representar a Break Point? Anotate por WhatsApp al ${wa}. ¡Cupos limitados!`], tags);
    case "promo":
      return unir([`🔥 ${titulo}`], [v.precio && `👉 ${v.precio}`, v.vigencia && `🗓️ Vale ${v.vigencia}`], [v.texto],
        [`Reservá tu cancha desde el turnero (link en la bio) o escribinos por WhatsApp al ${wa}.`], tags);
    case "turnos":
      return unir([`🎾 ${titulo}`], lineasHorarios(v.horarios).map((h) => `• ${h}`), [v.texto],
        [`Sacá tu turno desde el turnero (link en la bio) 📲 o escribinos por WhatsApp al ${wa}. ¡Te esperamos!`], tags);
    case "buffet":
      return unir([`🍽️ ${titulo}${v.precio ? ` · ${v.precio}` : ""}`], [v.texto],
        [`Te esperamos en Delicias Break antes o después del partido. ¿Lo querés listo cuando terminás? Encargalo por WhatsApp al ${wa}.`], tags);
    default:
      return unir([`📣 ${titulo}`], [v.texto], [`Cualquier duda, escribinos por WhatsApp al ${wa}.`], tags);
  }
}

/**
 * Parte un texto en renglones que entran en `anchoMax`, respetando los saltos de línea y cortando las palabras
 * más anchas que el renglón. PURA: `medir(texto)` devuelve el ancho (en el canvas, ctx.measureText(t).width).
 * @param {string} texto
 * @param {number} anchoMax
 * @param {(t: string) => number} medir
 * @returns {string[]}
 */
export function partirLineas(texto, anchoMax, medir) {
  const out = [];
  for (const parrafo of String(texto ?? "").split("\n")) {
    let linea = "";
    for (let palabra of parrafo.split(/\s+/).filter(Boolean)) {
      while (medir(palabra) > anchoMax && palabra.length > 1) {
        let i = palabra.length - 1;
        while (i > 1 && medir(palabra.slice(0, i)) > anchoMax) i--;
        if (linea) { out.push(linea); linea = ""; }
        out.push(palabra.slice(0, i));
        palabra = palabra.slice(i);
      }
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (linea && medir(prueba) > anchoMax) { out.push(linea); linea = palabra; } else linea = prueba;
    }
    if (linea) out.push(linea);
  }
  return out;
}

/** Deja como mucho `max` renglones; si sobran, el último termina en «…» y entra en el ancho. PURA. */
export function ajustarLineas(lineas, max, anchoMax, medir) {
  if (lineas.length <= max) return lineas;
  const out = lineas.slice(0, Math.max(0, max));
  if (!out.length) return out;
  let ult = out[out.length - 1];
  while (ult.length > 1 && medir(`${ult}…`) > anchoMax) ult = ult.slice(0, -1);
  out[out.length - 1] = `${ult.trimEnd()}…`;
  return out;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const hoyLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/**
 * Estado inicial del Studio a partir de la pieza que manda el club (o de nada: entonces con el ejemplo). PURA.
 * @param {{ plantilla?: string, titulo?: string, texto?: string, fecha?: string, hora?: string, precio?: string, canal?: string, formato?: string } | null} pieza
 * @param {Date} [hoy]
 */
export function estadoInicial(pieza, hoy = new Date()) {
  const p = pieza && typeof pieza === "object" ? pieza : null;
  const plantilla = p && PLANTILLAS[p.plantilla] ? p.plantilla : p ? (limpio(p.precio) ? "promo" : "novedad") : "torneo";
  const formato = p && FORMATOS[p.formato] ? p.formato : p?.canal === "historia" ? "historia" : "post";
  const valores = Object.fromEntries(Object.keys(CAMPOS).map((k) => [k, ""]));
  if (p) for (const k of Object.keys(CAMPOS)) valores[k] = p[k] == null ? "" : String(p[k]);
  else Object.assign(valores, PLANTILLAS[plantilla].ejemplo);
  return {
    plantilla, formato, valores,
    fecha: p && FECHA.test(p.fecha ?? "") ? p.fecha : hoyLocal(hoy),
    hora: p && HORA.test(p.hora ?? "") ? p.hora : "19:00",
    deLaPieza: Boolean(p),
  };
}

/**
 * Lo que se le pasa a `alGuardar`, o el motivo por el que no se puede. PURA.
 * @returns {{ ok: true, datos: { titulo: string, texto: string, canal: "post" | "historia", fecha: string, hora: string } } | { ok: false, motivo: string }}
 */
export function datosParaGuardar({ plantilla, formato, valores, caption, fecha, hora }) {
  const P = PLANTILLAS[plantilla] ?? PLANTILLAS.novedad;
  const titulo = limpio(valores?.titulo) || P.nombre;
  if (!FECHA.test(fecha ?? "")) return { ok: false, motivo: "Elegí la fecha de publicación." };
  if (!HORA.test(hora ?? "")) return { ok: false, motivo: "Elegí la hora de publicación." };
  const texto = limpio(caption);
  if (!texto) return { ok: false, motivo: "El caption está vacío: escribí algo o tocá «Volver al sugerido»." };
  return { ok: true, datos: { titulo: titulo.slice(0, 120), texto, canal: (FORMATOS[formato] ?? FORMATOS.post).canal, fecha, hora } };
}

/** breakpoint-torneo-2026-10-16.png */
export function nombreArchivo(plantilla, fecha) {
  const p = PLANTILLAS[plantilla] ? plantilla : "pieza";
  return `breakpoint-${p}-${FECHA.test(fecha ?? "") ? fecha : "sin-fecha"}.png`;
}

// ───────────────────────── dibujo de la placa (canvas) ─────────────────────────

const LETRA_TITULO = '"Anton","Archivo Narrow","Arial Narrow",Impact,sans-serif';
const LETRA_TEXTO = 'Montserrat,"Century Gothic","Avenir Next",system-ui,sans-serif';
const BLANCO = "#FFFFFF";

function ponerLetra(ctx, letra, espaciado = "0px") {
  ctx.font = letra;
  if ("letterSpacing" in ctx) ctx.letterSpacing = espaciado;
}
const medidor = (ctx) => (t) => ctx.measureText(t).width;

function fondo(ctx, W, H, foto) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, CLUB.azul);
  g.addColorStop(1, CLUB.azulHondo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (foto && foto.width && foto.height) {
    const r = Math.max(W / foto.width, H / foto.height), w = foto.width * r, h = foto.height * r;
    ctx.drawImage(foto, (W - w) / 2, (H - h) / 2, w, h);
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, "rgba(3,60,120,.72)");
    v.addColorStop(0.5, "rgba(3,50,105,.80)");
    v.addColorStop(1, "rgba(4,32,68,.92)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  // La cancha vista desde arriba, inclinada y cortada: textura de pádel, sin competir con el texto.
  const L = Math.max(W, H) * 1.05, A = L / 2;
  ctx.save();
  ctx.translate(W * 0.86, H * 0.62);
  ctx.rotate(-0.32);
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 7;
  ctx.strokeRect(-A / 2, -L / 2, A, L);
  const servicio = L * 0.3475;
  ctx.beginPath();
  for (const y of [0, -servicio, servicio]) { ctx.moveTo(-A / 2, y); ctx.lineTo(A / 2, y); }
  ctx.moveTo(0, -servicio); ctx.lineTo(0, servicio);
  ctx.stroke();
  ctx.restore();
}

/** El logo del club (mismo dibujo que .logo-bp de index.html: caja de 104 × 80), en blanco con la pelota naranja. */
function logo(ctx, x, y, alto) {
  const k = alto / 80;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = BLANCO;
  ctx.fillRect(0.5, 3.5, 3.6, 73);
  ponerLetra(ctx, `500 24.5px ${LETRA_TEXTO}`);
  ctx.textBaseline = "alphabetic";
  for (const [t, tx, ty, largo] of [["BREAK", 9.5, 25, 92], ["P", 9.5, 51, 15.5], ["INT", 45, 51, 56.5], ["PADEL", 9.5, 77, 92]]) {
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

function pastilla(ctx, texto, { x, y, alto, letra, alinear = "izq", anchoMax = Infinity, fondoColor = CLUB.naranja, color = BLANCO }) {
  ponerLetra(ctx, letra, "1px");
  const pad = alto * 0.55;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t).width + pad * 2 > anchoMax) t = t.slice(0, -1);
  if (t !== texto) t = `${t.trimEnd()}…`;
  const w = ctx.measureText(t).width + pad * 2;
  const x0 = alinear === "der" ? x - w : x;
  ctx.fillStyle = fondoColor;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0, y, w, alto, alto / 2); else ctx.rect(x0, y, w, alto);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(t, x0 + pad, y + alto / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

/** Título grande en mayúsculas, condensado e inclinado como las placas del club. Achica hasta que entra. */
function titulo(ctx, texto, { x, y, ancho, maxAlto, tam, min, aviso }) {
  const t = String(texto).toUpperCase();
  let s = tam, ls = [];
  for (;;) {
    ponerLetra(ctx, `${s}px ${LETRA_TITULO}`, "0.5px");
    ls = partirLineas(t, ancho - s * 0.25, medidor(ctx));
    if (ls.length * s * 1.02 <= maxAlto || s <= min) break;
    s -= 6;
  }
  const maxT = Math.max(1, Math.floor(maxAlto / (s * 1.02)));
  if (ls.length > maxT && aviso) aviso.recortado = true;
  ls = ajustarLineas(ls, maxT, ancho - s * 0.25, medidor(ctx));
  ctx.fillStyle = BLANCO;
  let base = y + s * 0.84;
  for (const l of ls) {
    ctx.save();
    ctx.translate(x, base);
    ctx.transform(1, 0, -0.16, 1, 0, 0);
    ctx.fillText(l, 0, 0);
    ctx.restore();
    base += s * 1.02;
  }
  const fin = y + ls.length * s * 1.02;
  ctx.fillStyle = CLUB.naranja;
  ctx.fillRect(x, fin + 14, 132, 12);
  return fin + 26;
}

/** Párrafo que achica hasta entrar antes de `maxY`; si ni al mínimo entra, corta con «…». Devuelve el y final. */
function parrafo(ctx, texto, { x, y, ancho, tam, min, peso = 500, color = BLANCO, maxY, aviso }) {
  if (!limpio(texto)) return y;
  if (y >= maxY) { if (aviso) aviso.recortado = true; return y; }
  let s = tam, ls = [];
  for (;;) {
    ponerLetra(ctx, `${peso} ${s}px ${LETRA_TEXTO}`);
    ls = partirLineas(texto, ancho, medidor(ctx));
    if (y + ls.length * s * 1.32 <= maxY || s <= min) break;
    s -= 2;
  }
  const lh = s * 1.32;
  const maxP = Math.max(0, Math.floor((maxY - y) / lh));
  if (ls.length > maxP && aviso) aviso.recortado = true;
  ls = ajustarLineas(ls, maxP, ancho, medidor(ctx));
  ctx.fillStyle = color;
  let base = y + s * 0.95;
  for (const l of ls) { ctx.fillText(l, x, base); base += lh; }
  return y + ls.length * lh;
}

function filasDatos(ctx, filas, { x, y, ancho, maxY, historia, aviso }) {
  const tv = historia ? 46 : 40, tr = historia ? 26 : 24, sep = historia ? 30 : 22;
  ponerLetra(ctx, `700 ${tv}px ${LETRA_TEXTO}`);
  const armar = (max) => filas.map(([rotulo, valor]) => {
    const todas = partirLineas(valor, ancho - 30, medidor(ctx));
    return { rotulo, ls: ajustarLineas(todas, max, ancho - 30, medidor(ctx)), corta: todas.length > max };
  });
  const alto = (f) => tr + 10 + f.ls.length * tv * 1.2;
  let filasA = armar(2);
  if (y + filasA.reduce((t, f) => t + alto(f) + sep, 0) > maxY) filasA = armar(1);
  for (const f of filasA) {
    const { rotulo, ls } = f;
    if (y + alto(f) > maxY) { if (aviso) aviso.recortado = true; break; }
    if (f.corta && aviso) aviso.recortado = true;
    ctx.fillStyle = CLUB.naranja;
    ctx.beginPath();
    ctx.arc(x + 9, y + tr * 0.5, 9, 0, Math.PI * 2);
    ctx.fill();
    ponerLetra(ctx, `700 ${tr}px ${LETRA_TEXTO}`, "3px");
    ctx.fillStyle = CLUB.celeste;
    ctx.fillText(rotulo.toUpperCase(), x + 30, y + tr * 0.85);
    ponerLetra(ctx, `700 ${tv}px ${LETRA_TEXTO}`);
    ctx.fillStyle = BLANCO;
    let base = y + tr + 10 + tv * 0.92;
    for (const l of ls) { ctx.fillText(l, x + 30, base); base += tv * 1.2; }
    y += alto(f) + sep;
  }
  return y;
}

/** Precio o descuento gigante, en blanco y subrayado en naranja. */
function precioGrande(ctx, precio, { x, y, ancho, tam }) {
  let s = tam;
  for (;;) {
    ponerLetra(ctx, `${s}px ${LETRA_TITULO}`, "1px");
    if (ctx.measureText(precio).width <= ancho || s <= 60) break;
    s -= 8;
  }
  ctx.fillStyle = BLANCO;
  ctx.fillText(precio, x, y + s * 0.86);
  const w = Math.min(ancho, ctx.measureText(precio).width);
  ctx.fillStyle = CLUB.naranja;
  ctx.fillRect(x, y + s * 0.86 + 30, w, 14);
  return y + s * 0.86 + 44;
}

function grillaHorarios(ctx, horarios, { x, y, ancho, maxY, historia, aviso }) {
  if (!horarios.length) return y;
  const largos = horarios.some((h) => h.length > 6);
  const cols = largos ? 2 : historia ? 3 : 4;
  const gap = 18, alto = historia ? 104 : 92;
  const w = (ancho - gap * (cols - 1)) / cols;
  const filasQueEntran = Math.max(1, Math.floor((maxY - y + gap) / (alto + gap)));
  let lista = horarios;
  if (Math.ceil(lista.length / cols) > filasQueEntran) {
    const lugar = filasQueEntran * cols - 1;
    lista = [...horarios.slice(0, lugar), `+${horarios.length - lugar} más`];
    if (aviso) aviso.recortado = true;
  }
  let s = historia ? 44 : 40;
  ponerLetra(ctx, `700 ${s}px ${LETRA_TEXTO}`);
  while (s > 22 && lista.some((h) => ctx.measureText(h).width > w - 36)) { s -= 2; ponerLetra(ctx, `700 ${s}px ${LETRA_TEXTO}`); }
  lista.forEach((h, i) => {
    const cx = x + (i % cols) * (w + gap), cy = y + Math.floor(i / cols) * (alto + gap);
    ctx.fillStyle = BLANCO;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx, cy, w, alto, 18); else ctx.rect(cx, cy, w, alto);
    ctx.fill();
    ctx.fillStyle = CLUB.azul;
    ctx.textBaseline = "middle";
    let t = h;
    while (t.length > 1 && ctx.measureText(t).width > w - 36) t = t.slice(0, -1);
    ctx.fillText(t, cx + 18, cy + alto / 2 + 1);
    ctx.textBaseline = "alphabetic";
  });
  return y + Math.ceil(lista.length / cols) * (alto + gap);
}

const CUERPOS = {
  torneo(ctx, v, c) {
    const filas = [["Categorías", v.categorias], ["Cuándo", v.cuando], ["Inscripción", v.inscripcion], ["Premios", v.premio]].filter((f) => f[1]);
    // El título cede lugar para que entren todas las filas (antes que el texto opcional).
    const zona = c.limite - c.y, altoFilas = filas.length * (c.historia ? 124 : 106) + (c.historia ? 56 : 34) + 26;
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
 * Dibuja la placa completa en el canvas del contexto (le ajusta el tamaño al formato).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ plantilla: string, formato: string, valores: Record<string, string>, foto?: CanvasImageSource & { width: number, height: number } | null }} pieza
 * @returns {{ recortado: boolean }} `recortado`: algún texto no entró entero (se cortó con «…» o quedó afuera).
 */
export function dibujarPieza(ctx, { plantilla, formato, valores, foto = null }) {
  const F = FORMATOS[formato] ?? FORMATOS.post;
  const clave = PLANTILLAS[plantilla] ? plantilla : "novedad";
  const P = PLANTILLAS[clave];
  const W = F.ancho, H = F.alto;
  if (ctx.canvas.width !== W) ctx.canvas.width = W;
  if (ctx.canvas.height !== H) ctx.canvas.height = H;
  const v = Object.fromEntries(Object.keys(CAMPOS).map((k) => [k, limpio(valores?.[k])]));
  v.titulo ||= P.nombre;
  const historia = formato === "historia";
  // Historia: Instagram tapa ~250 px arriba (usuario) y abajo (responder): ahí no va nada.
  const mx = 84, ancho = W - mx * 2, arriba = historia ? 240 : 70, abajo = historia ? H - 250 : H - 62;
  const altoLogo = historia ? 124 : 104, altoCta = historia ? 96 : 84, ctaY = abajo - (historia ? 64 : 50) - altoCta;
  const marco = () => {
    fondo(ctx, W, H, foto);
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
  const y = arriba + altoLogo + (historia ? 90 : 48), limite = ctaY - (historia ? 64 : 36);
  let aviso = { recortado: false };
  marco();
  const fin = CUERPOS[clave](ctx, v, { x: mx, y, ancho, limite, historia, aviso });
  // Si sobra mucho aire abajo (historias, textos cortos), se baja el contenido para que quede centrado: 2.ª pasada.
  const sobra = limite - fin;
  if (sobra > 60) {
    aviso = { recortado: false };
    marco();
    CUERPOS[clave](ctx, v, { x: mx, y: y + Math.round(sobra * 0.4), ancho, limite, historia, aviso });
  }
  return aviso;
}

// ───────────────────────── DOM: el diálogo ─────────────────────────

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const CSS = `
.studio{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;overflow:auto;overscroll-behavior:contain;
  background:var(--paper,#fffdf8);color:var(--ink,#221d17);font-family:var(--sans,system-ui,sans-serif);font-size:15px;line-height:1.45;color-scheme:inherit}
.studio::backdrop{background:var(--overlay,rgba(23,18,12,.5))}
.studio *{box-sizing:border-box}
.studio :focus-visible{outline:2px solid var(--royal,#035ba8);outline-offset:2px}
.st-cab{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--paper,#fffdf8);border-bottom:1px solid var(--line,#e5ddcf)}
.st-cab h2{margin:0;font:800 1.15rem/1.15 var(--display,var(--sans,system-ui,sans-serif));letter-spacing:.01em}
.st-cab p{margin:2px 0 0;color:var(--muted,#6e6558);font-size:.84rem}
.st-x{margin-left:auto;flex:none;width:44px;height:44px;border-radius:999px;border:1px solid var(--line,#e5ddcf);background:var(--panel,#fff);color:var(--ink,#221d17);font-size:1.5rem;line-height:1}
.st-cuerpo{display:grid;gap:20px;padding:16px;max-width:1240px;margin:0 auto}
@media (min-width:900px){.st-cuerpo{grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:28px;padding:24px}}
.st-form,.st-prev{display:grid;gap:12px;align-content:start;min-width:0}
.st-campo{display:grid;gap:4px;min-width:0}
.st-campo[hidden]{display:none}
.st-par{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.studio label{font-weight:600;font-size:.86rem;color:var(--ink-2,var(--ink,#221d17))}
.studio input,.studio select,.studio textarea{width:100%;min-width:0;font:inherit;font-size:16px;color:inherit;background:var(--panel,#fff);border:1px solid var(--line,#e5ddcf);border-radius:var(--radius,10px);padding:9px 11px}
.studio input[type=file]{padding:7px}
.studio textarea{resize:vertical;min-height:76px}
.studio #st-caption{min-height:190px}
.st-ayuda{margin:0;color:var(--muted,#6e6558);font-size:.8rem}
.st-ayuda:empty{display:none}
.st-caja{display:grid;place-items:center;padding:12px;border-radius:12px;background:var(--cream,#f7f2ea);border:1px solid var(--line,#e5ddcf)}
.st-lienzo{display:block;max-width:100%;max-height:min(70vh,820px);width:auto;height:auto;border-radius:6px;box-shadow:0 14px 40px -18px rgba(0,0,0,.45)}
.st-acciones{display:flex;flex-wrap:wrap;gap:8px}
.st-btn{min-height:44px;padding:10px 16px;border-radius:999px;border:1px solid var(--line,#e5ddcf);background:var(--panel,#fff);color:var(--ink,#221d17);font:inherit;font-weight:700}
.st-btn.pri{background:var(--royal,#035ba8);border-color:var(--royal,#035ba8);color:var(--paper,#fff)}
.st-btn:disabled{opacity:.6;cursor:progress}
.st-btn[hidden]{display:none}
.st-msg{margin:0;padding:8px 12px;border-radius:8px;font-weight:600}
.st-msg:empty{display:none}
.st-err{background:var(--bad-soft,#fde7e5);color:var(--bad,#b42318)}
.st-ok{background:var(--ok-soft,#e1f3e8);color:var(--ok,#1d7a46)}
@media (prefers-reduced-motion:no-preference){.studio[open]{animation:st-entra .18s var(--ease,ease-out)}}
@keyframes st-entra{from{opacity:0;transform:translateY(8px)}}
`;

function ponerEstilos(doc) {
  if (!doc.getElementById("studio-css")) {
    const s = doc.createElement("style");
    s.id = "studio-css";
    s.textContent = CSS;
    doc.head.appendChild(s);
  }
  // Tipografías de la placa: Anton (como las placas del club) y Montserrat (como el logo). Si no cargan, hay respaldo.
  if (!doc.getElementById("studio-fuentes")) {
    const l = doc.createElement("link");
    l.id = "studio-fuentes";
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@500;600;700&display=swap";
    doc.head.appendChild(l);
  }
}

function marcado() {
  const campos = Object.entries(CAMPOS).map(([k, c]) => `<div class="st-campo" data-campo="${k}"><label for="st-${k}">${esc(c.etiqueta)}</label>${
    c.multi ? `<textarea id="st-${k}" rows="${k === "horarios" ? 5 : 3}"></textarea>` : `<input id="st-${k}" type="text" autocomplete="off">`}</div>`).join("");
  const opciones = (o) => Object.entries(o).map(([k, x]) => `<option value="${k}">${esc(x.nombre)}</option>`).join("");
  return `<header class="st-cab"><div><h2 id="st-encabezado">Studio de contenido</h2><p>Armá la placa, copiá el texto y mandala al calendario.</p></div>
<button type="button" class="st-x" id="st-cerrar" aria-label="Cerrar el Studio">×</button></header>
<div class="st-cuerpo">
<form class="st-form" id="st-form" novalidate>
<div class="st-par"><div class="st-campo"><label for="st-plantilla">Plantilla</label><select id="st-plantilla">${opciones(PLANTILLAS)}</select></div>
<div class="st-campo"><label for="st-formato">Formato</label><select id="st-formato">${opciones(FORMATOS)}</select></div></div>
${campos}
<div class="st-campo"><label for="st-foto">Foto de fondo (opcional)</label><input id="st-foto" type="file" accept="image/*" aria-describedby="st-foto-ayuda">
<p class="st-ayuda" id="st-foto-ayuda">La foto queda en tu equipo: no se sube a ningún lado.</p>
<button type="button" class="st-btn" id="st-sin-foto" hidden>Quitar la foto</button></div>
<div class="st-par"><div class="st-campo"><label for="st-fecha">Día de publicación</label><input id="st-fecha" type="date"></div>
<div class="st-campo"><label for="st-hora">Hora</label><input id="st-hora" type="time" step="300"></div></div>
</form>
<section class="st-prev" aria-label="Vista previa y acciones">
<div class="st-caja"><canvas class="st-lienzo" id="st-lienzo" width="1080" height="1080" role="img" aria-label="Vista previa de la placa"></canvas></div>
<p class="st-ayuda" id="st-aviso"></p>
<p class="st-msg st-err" id="st-error" role="alert"></p>
<p class="st-msg st-ok" id="st-ok" role="status"></p>
<div class="st-acciones">
<button type="button" class="st-btn pri" id="st-guardar">Guardar en el calendario</button>
<button type="button" class="st-btn" id="st-descargar">Descargar imagen (PNG)</button>
<button type="button" class="st-btn" id="st-copiar">Copiar caption</button>
</div>
<div class="st-campo"><label for="st-caption">Caption sugerido (lo podés editar)</label><textarea id="st-caption" rows="8"></textarea>
<button type="button" class="st-btn" id="st-rearmar" hidden>Volver al sugerido</button></div>
</section>
</div>`;
}

/**
 * Abre el Studio a pantalla completa.
 * @param {{
 *   pieza?: { plantilla?: string, titulo?: string, texto?: string, fecha?: string, hora?: string, precio?: string, canal?: string } | null,
 *   alGuardar?: (d: { titulo: string, texto: string, canal: "post" | "historia", fecha: string, hora: string }) => unknown,
 *   alCerrar?: (r: { guardado: boolean }) => void,
 * }} [opciones]
 * `alGuardar` puede devolver (o resolver) `false` o `{ ok: false, motivo }` si no se guardó: el Studio queda abierto
 * y muestra el error. Cualquier otra cosa (`true`, `undefined`, `{ ok: true }`) cuenta como guardado y se cierra. `alCerrar` se llama siempre al cerrarse (Esc, ×, o después de guardar).
 * @returns {{ dialogo: HTMLDialogElement, cerrar: () => void }}
 */
export function abrirStudio({ pieza = null, alGuardar, alCerrar } = {}) {
  const doc = document;
  ponerEstilos(doc);
  const previo = doc.getElementById("studio");
  if (previo) { if (previo.open) previo.close(); previo.remove(); }
  const volverA = doc.activeElement;
  const dlg = doc.createElement("dialog");
  dlg.id = "studio";
  dlg.className = "studio";
  dlg.setAttribute("aria-labelledby", "st-encabezado");
  dlg.innerHTML = marcado();
  doc.body.appendChild(dlg);
  const $ = (id) => dlg.querySelector(`#st-${id}`);
  const lienzo = $("lienzo"), ctx = lienzo.getContext("2d"), captionEl = $("caption");

  const ini = estadoInicial(pieza);
  const st = { ...ini, foto: null, fotoUrl: "", captionManual: false, guardado: false, tocados: new Set(ini.deLaPieza ? Object.keys(CAMPOS) : []) };
  $("plantilla").value = st.plantilla;
  $("formato").value = st.formato;
  $("fecha").value = st.fecha;
  $("hora").value = st.hora;
  for (const k of Object.keys(CAMPOS)) $(k).value = st.valores[k];

  const msg = (tipo, texto) => {
    $("error").textContent = tipo === "error" ? texto : "";
    $("ok").textContent = tipo === "ok" ? texto : "";
  };

  function aplicarPlantilla() {
    const P = PLANTILLAS[st.plantilla];
    for (const k of Object.keys(CAMPOS)) {
      const usa = P.campos.includes(k);
      const caja = dlg.querySelector(`[data-campo="${k}"]`);
      caja.hidden = !usa;
      caja.querySelector("label").textContent = P.etiquetas[k] ?? CAMPOS[k].etiqueta;
      const pista = P.pistas?.[k] ?? P.ejemplo[k];
      $(k).placeholder = pista ? `Ej.: ${pista.split("\n")[0]}` : "";
      if (usa && !st.tocados.has(k)) { st.valores[k] = P.ejemplo[k] ?? ""; $(k).value = st.valores[k]; }
    }
  }

  let pedido = 0;
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16);
  function pintar() {
    if (pedido) return;
    pedido = raf(() => {
      pedido = 0;
      try {
        const { recortado } = dibujarPieza(ctx, st);
        $("aviso").textContent = recortado ? "Hay texto que no entra en la placa y quedó cortado con «…»: acortalo o probá el formato Historia. El caption sí va completo." : "";
      } catch { msg("error", "No se pudo dibujar la vista previa."); }
      lienzo.setAttribute("aria-label", `Vista previa: ${PLANTILLAS[st.plantilla].nombre}, ${limpio(st.valores.titulo) || "sin título"}`);
      if (!st.captionManual) captionEl.value = armarCaption(st.plantilla, st.valores);
    });
  }

  aplicarPlantilla();
  pintar();

  // Campos: la placa y el caption se rearman mientras se escribe.
  $("form").addEventListener("input", (ev) => {
    const id = ev.target.id?.replace(/^st-/, "");
    if (id && id in CAMPOS) { st.valores[id] = ev.target.value; st.tocados.add(id); }
    else if (id === "fecha" || id === "hora") st[id] = ev.target.value;
    pintar();
  });
  $("plantilla").addEventListener("change", (ev) => { st.plantilla = ev.target.value; aplicarPlantilla(); pintar(); });
  $("formato").addEventListener("change", (ev) => { st.formato = ev.target.value; pintar(); });
  $("form").addEventListener("submit", (ev) => ev.preventDefault());

  // Foto: sólo local (FileReader). Nada sale del equipo.
  $("foto").addEventListener("change", (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { msg("error", "Eso no es una imagen: elegí una foto (JPG, PNG o WebP)."); return; }
    if (f.size > 15 * 1024 * 1024) { msg("error", "La foto pesa más de 15 MB: elegí una más liviana."); return; }
    const lector = new FileReader();
    lector.onload = () => {
      const im = new Image();
      im.onload = () => { st.foto = im; $("sin-foto").hidden = false; msg("ok", "Foto puesta de fondo."); pintar(); };
      im.onerror = () => msg("error", "No se pudo leer la foto. Probá con otra.");
      im.src = String(lector.result);
    };
    lector.onerror = () => msg("error", "No se pudo leer la foto. Probá con otra.");
    lector.readAsDataURL(f);
  });
  $("sin-foto").addEventListener("click", () => {
    st.foto = null; $("foto").value = ""; $("sin-foto").hidden = true; msg("ok", "Foto quitada."); pintar(); $("foto").focus();
  });

  // Caption: si lo editan a mano, deja de rearmarse solo hasta «Volver al sugerido».
  captionEl.addEventListener("input", () => { st.captionManual = true; $("rearmar").hidden = false; });
  $("rearmar").addEventListener("click", () => {
    st.captionManual = false; $("rearmar").hidden = true; captionEl.value = armarCaption(st.plantilla, st.valores); captionEl.focus();
  });

  $("copiar").addEventListener("click", async () => {
    const texto = captionEl.value;
    try {
      await navigator.clipboard.writeText(texto);
      msg("ok", "Caption copiado: pegalo en Instagram.");
    } catch {
      captionEl.focus();
      captionEl.select();
      let hecho = false;
      try { hecho = doc.execCommand("copy"); } catch { hecho = false; }
      if (hecho) msg("ok", "Caption copiado: pegalo en Instagram.");
      else msg("error", "No se pudo copiar solo. El texto quedó seleccionado: copialo con Ctrl+C (o dejando apretado en el celu).");
    }
  });

  $("descargar").addEventListener("click", () => {
    dibujarPieza(ctx, st);
    const nombre = nombreArchivo(st.plantilla, st.fecha);
    const bajar = (href, liberar) => {
      const a = doc.createElement("a");
      a.href = href;
      a.download = nombre;
      dlg.appendChild(a); // dentro del diálogo: fuera de él la página está inerte
      a.click();
      a.remove();
      if (liberar) setTimeout(() => URL.revokeObjectURL(href), 4000);
      msg("ok", `Imagen descargada: ${nombre}`);
    };
    const porDataUrl = () => {
      try { bajar(lienzo.toDataURL("image/png"), false); } catch { msg("error", "No se pudo armar la imagen. Sacale una captura a la vista previa."); }
    };
    try {
      if (typeof lienzo.toBlob === "function" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        lienzo.toBlob((b) => (b ? bajar(URL.createObjectURL(b), true) : porDataUrl()), "image/png");
      } else porDataUrl();
    } catch { porDataUrl(); }
  });

  $("guardar").addEventListener("click", async () => {
    const r = datosParaGuardar({ ...st, caption: captionEl.value });
    if (!r.ok) { msg("error", r.motivo); return; }
    if (typeof alGuardar !== "function") { msg("error", "El calendario no está conectado: copiá el caption y descargá la imagen."); return; }
    const b = $("guardar");
    b.disabled = true;
    try {
      const res = await alGuardar(r.datos);
      if (res === false || (res && typeof res === "object" && res.ok === false)) {
        msg("error", res?.motivo || "No se pudo guardar en el calendario. Revisá el aviso del club y probá de nuevo.");
        return;
      }
      st.guardado = true;
      cerrar();
    } catch (e) {
      msg("error", `No se pudo guardar en el calendario${e?.message ? `: ${e.message}` : "."}`);
    } finally {
      b.disabled = false;
    }
  });

  function cerrar() { if (dlg.open) dlg.close(); else alCerrarUnaVez(); }
  let cerrado = false;
  function alCerrarUnaVez() {
    if (cerrado) return;
    cerrado = true;
    dlg.remove();
    if (volverA && typeof volverA.focus === "function" && doc.contains(volverA)) volverA.focus();
    if (typeof alCerrar === "function") alCerrar({ guardado: st.guardado });
  }
  $("cerrar").addEventListener("click", cerrar);
  dlg.addEventListener("close", alCerrarUnaVez); // Esc (cancel nativo), × o después de guardar

  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  $("plantilla").focus();

  // Re-dibuja cuando llegan las tipografías (si no llegan en 3 s, queda con las de respaldo).
  if (doc.fonts?.load) {
    const cargas = ["40px Anton", "500 40px Montserrat", "700 40px Montserrat"].map((f) => doc.fonts.load(f).catch(() => null));
    Promise.race([Promise.all(cargas), new Promise((r) => setTimeout(r, 3000))]).then(() => { if (!cerrado) pintar(); });
  }
  return { dialogo: dlg, cerrar };
}
