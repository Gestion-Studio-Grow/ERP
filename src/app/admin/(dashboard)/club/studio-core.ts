// ============================================================================
// STUDIO DE REDES — la placa con la marca del club y el caption en criollo. PURO.
// ============================================================================
//
// Paridad con el Studio del sistema de hoy (public/previews/breakpoint/club/studio.mjs, `abrirStudio`, y cómo lo abre
// app.mjs: `abrirElStudio`, desde «Hacer la imagen en el Studio» de la difusión y «Abrir el Studio de redes» del
// calendario). Decisión del dueño (18/10): el Studio queda en el sistema de hoy y se hace TAMBIÉN acá.
//   · cinco plantillas (torneo, promo, turnos libres, novedad, buffet) y tres formatos (post cuadrado, vertical,
//     historia), con los campos que usa cada una y un ejemplo para arrancar;
//   · el caption sugerido en criollo, con el WhatsApp del club, el turnero y 3 o 4 hashtags; si se edita a mano deja
//     de rearmarse hasta «Volver al sugerido»;
//   · las MEDIDAS de la placa (márgenes, zona segura de la historia, logo, llamado) y el partido de renglones que
//     usa el dibujo (studio-placa.ts);
//   · lo que se manda al calendario de redes: una publicación «programada» (la guarda `ejecutarNovedades`).
// Todo local: la foto que se sube no sale del equipo. studio-core.test.ts cubre lo de acá.
//
// Marca: colores, usuario y WhatsApp relevados de Instagram y autorizados por el club el 15/10
// (docs/tenants/breakpoint/MARCA-INSTAGRAM.md). Son los de la placa (el lienzo), no los de la pantalla del ERP.

import type { CanalContenido, EstadoContenido, Fecha, TipoNovedad } from "@/lib/club/motor.mjs";

/** Datos del club que salen en las placas y en los captions. */
export const CLUB = Object.freeze({
  usuario: "@breakpointpadel_",
  whatsapp: "11 6187-0066",
  azul: "#035BA8",
  azulHondo: "#06386E",
  naranja: "#DC6E22",
  celeste: "#BFD8F2",
});

export type ClaveFormato = "post" | "vertical" | "historia";
export interface Formato {
  nombre: string;
  ancho: number;
  alto: number;
  canal: Extract<CanalContenido, "post" | "historia">;
}

export const FORMATOS: Readonly<Record<ClaveFormato, Formato>> = Object.freeze({
  post: { nombre: "Post cuadrado", ancho: 1080, alto: 1080, canal: "post" },
  vertical: { nombre: "Post vertical", ancho: 1080, alto: 1350, canal: "post" },
  historia: { nombre: "Historia", ancho: 1080, alto: 1920, canal: "historia" },
});

export type ClaveCampo = "titulo" | "categorias" | "cuando" | "inscripcion" | "premio" | "precio" | "vigencia" | "horarios" | "texto";
export type Valores = Record<ClaveCampo, string>;

/** Todos los campos posibles; cada plantilla usa algunos. `multi` = de varios renglones. */
export const CAMPOS: Readonly<Record<ClaveCampo, { etiqueta: string; multi?: boolean }>> = Object.freeze({
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
export const CLAVES_CAMPO = Object.keys(CAMPOS) as ClaveCampo[];

export type ClavePlantilla = "torneo" | "promo" | "turnos" | "novedad" | "buffet";
export interface Plantilla {
  nombre: string;
  /** La pastilla naranja de arriba a la derecha. */
  rotulo: string;
  /** El llamado de abajo. */
  cta: string;
  campos: readonly ClaveCampo[];
  etiquetas: Partial<Record<ClaveCampo, string>>;
  hashtags: readonly string[];
  ejemplo: Partial<Valores>;
  /** Sólo de pista (placeholder), no se carga: p. ej. con las 4 filas del torneo, el texto no entra en el post. */
  pistas?: Partial<Valores>;
}

export const PLANTILLAS: Readonly<Record<ClavePlantilla, Plantilla>> = Object.freeze({
  torneo: {
    nombre: "Torneo",
    rotulo: "TORNEO",
    cta: "Anotate por WhatsApp",
    campos: ["titulo", "categorias", "cuando", "inscripcion", "premio", "texto"],
    etiquetas: { titulo: "Nombre del torneo", texto: "Algo más (opcional)" },
    hashtags: ["#TorneoDePadel", "#Padel"],
    ejemplo: {
      titulo: "Torneo relámpago de primavera",
      categorias: "4ta, 5ta y 6ta · damas y caballeros",
      cuando: "Sábado 8/11 desde las 9",
      inscripcion: "$24.000 por pareja",
      premio: "Paletas y kits para los campeones",
    },
    pistas: { texto: "Buffet abierto todo el día." },
  },
  promo: {
    nombre: "Promo",
    rotulo: "PROMO",
    cta: "Reservá desde el turnero",
    campos: ["titulo", "precio", "vigencia", "texto"],
    etiquetas: { texto: "Detalle (opcional)" },
    hashtags: ["#PromoPadel", "#Padel"],
    ejemplo: { titulo: "Turnos de valle", precio: "2x1", vigencia: "de lunes a viernes, de 10 a 16", texto: "La segunda hora de cancha corre por nuestra cuenta." },
  },
  turnos: {
    nombre: "Turnos libres hoy",
    rotulo: "HOY",
    cta: "Reservá desde el turnero",
    campos: ["titulo", "horarios", "texto"],
    etiquetas: { texto: "Texto (opcional)" },
    hashtags: ["#TurnosLibres", "#Padel"],
    ejemplo: { titulo: "Turnos libres hoy", horarios: "10:00 · Cancha 1\n11:30 · Cancha 2\n15:00 · Cancha 1\n17:30 · Cancha 3", texto: "Armá el partido y reservá en un minuto." },
  },
  novedad: {
    nombre: "Novedad del club",
    rotulo: "NOVEDAD",
    cta: "Escribinos por WhatsApp",
    campos: ["titulo", "texto"],
    etiquetas: {},
    hashtags: ["#Padel"],
    ejemplo: { titulo: "Escuelita de pádel: arrancan grupos nuevos", texto: "Martes y jueves de 18 a 19, para chicos de 7 a 14. Anotalos por WhatsApp." },
  },
  buffet: {
    nombre: "Buffet · Delicias",
    rotulo: "DELICIAS BREAK",
    cta: "Te esperamos en el buffet",
    campos: ["titulo", "precio", "texto"],
    etiquetas: { titulo: "Plato", precio: "Precio", texto: "Descripción (opcional)" },
    hashtags: ["#DeliciasBreak"],
    ejemplo: { titulo: "Milanesa napolitana con papas", precio: "$14.500", texto: "Recién hecha, para después del partido." },
  },
});

const esPlantilla = (k: unknown): k is ClavePlantilla => typeof k === "string" && Object.hasOwn(PLANTILLAS, k);
const esFormato = (k: unknown): k is ClaveFormato => typeof k === "string" && Object.hasOwn(FORMATOS, k);

export const OPCIONES_PLANTILLA = (Object.keys(PLANTILLAS) as ClavePlantilla[]).map((valor) => ({ valor, etiqueta: PLANTILLAS[valor].nombre }));
export const OPCIONES_FORMATO = (Object.keys(FORMATOS) as ClaveFormato[]).map((valor) => ({ valor, etiqueta: FORMATOS[valor].nombre }));

const HASHTAGS_CLUB = ["#BreakPointPadel", "#PadelEzeiza"];
const limpio = (s: unknown) => String(s ?? "").trim();

/** La etiqueta del campo en esa plantilla (p. ej. «Nombre del torneo» en vez de «Título»). */
export const etiquetaDelCampo = (plantilla: ClavePlantilla, campo: ClaveCampo) => PLANTILLAS[plantilla].etiquetas[campo] ?? CAMPOS[campo].etiqueta;

/** El placeholder del campo: «Ej.: …» con el primer renglón del ejemplo (o de la pista); vacío si no hay. */
export function pistaDelCampo(plantilla: ClavePlantilla, campo: ClaveCampo): string {
  const P = PLANTILLAS[plantilla];
  const p = P.pistas?.[campo] ?? P.ejemplo[campo];
  return p ? `Ej.: ${p.split("\n")[0]}` : "";
}

/** Horarios de la lista: uno por renglón, sin vacíos (máximo 12). */
export function lineasHorarios(texto: string | null | undefined): string[] {
  return String(texto ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Une secciones (listas de renglones): renglones vacíos fuera, secciones vacías fuera, una línea en blanco entre secciones. */
function unir(...secciones: (string | false | undefined | null)[][]): string {
  return secciones
    .map((s) => s.filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");
}

/** Caption sugerido, en criollo, con llamado a WhatsApp / turnero y 3 a 4 hashtags. */
export function armarCaption(plantilla: string, valores: Partial<Valores> = {}): string {
  const clave: ClavePlantilla = esPlantilla(plantilla) ? plantilla : "novedad";
  const P = PLANTILLAS[clave];
  const v = Object.fromEntries(CLAVES_CAMPO.map((k) => [k, limpio(valores[k])])) as Valores;
  const titulo = v.titulo || P.nombre;
  const wa = CLUB.whatsapp;
  const tags = [[...HASHTAGS_CLUB, ...P.hashtags].join(" ")];
  switch (clave) {
    case "torneo":
      return unir(
        [`🏆 ${titulo}`],
        [v.categorias && `🎾 Categorías: ${v.categorias}`, v.cuando && `📅 ${v.cuando}`, v.inscripcion && `💸 Inscripción: ${v.inscripcion}`, v.premio && `🥇 Premios: ${v.premio}`],
        [v.texto],
        [`¿Vas a representar a Break Point? Anotate por WhatsApp al ${wa}. ¡Cupos limitados!`],
        tags,
      );
    case "promo":
      return unir([`🔥 ${titulo}`], [v.precio && `👉 ${v.precio}`, v.vigencia && `🗓️ Vale ${v.vigencia}`], [v.texto], [`Reservá tu cancha desde el turnero (link en la bio) o escribinos por WhatsApp al ${wa}.`], tags);
    case "turnos":
      return unir([`🎾 ${titulo}`], lineasHorarios(v.horarios).map((h) => `• ${h}`), [v.texto], [`Sacá tu turno desde el turnero (link en la bio) 📲 o escribinos por WhatsApp al ${wa}. ¡Te esperamos!`], tags);
    case "buffet":
      return unir(
        [`🍽️ ${titulo}${v.precio ? ` · ${v.precio}` : ""}`],
        [v.texto],
        [`Te esperamos en Delicias Break antes o después del partido. ¿Lo querés listo cuando terminás? Encargalo por WhatsApp al ${wa}.`],
        tags,
      );
    default:
      return unir([`📣 ${titulo}`], [v.texto], [`Cualquier duda, escribinos por WhatsApp al ${wa}.`], tags);
  }
}

export type Medir = (t: string) => number;

/**
 * Parte un texto en renglones que entran en `anchoMax`, respetando los saltos de línea y cortando las palabras más
 * anchas que el renglón. `medir(texto)` devuelve el ancho (en el lienzo, `ctx.measureText(t).width`).
 */
export function partirLineas(texto: string, anchoMax: number, medir: Medir): string[] {
  const out: string[] = [];
  for (const parrafo of String(texto ?? "").split("\n")) {
    let linea = "";
    for (let palabra of parrafo.split(/\s+/).filter(Boolean)) {
      while (medir(palabra) > anchoMax && palabra.length > 1) {
        let i = palabra.length - 1;
        while (i > 1 && medir(palabra.slice(0, i)) > anchoMax) i--;
        if (linea) {
          out.push(linea);
          linea = "";
        }
        out.push(palabra.slice(0, i));
        palabra = palabra.slice(i);
      }
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (linea && medir(prueba) > anchoMax) {
        out.push(linea);
        linea = palabra;
      } else linea = prueba;
    }
    if (linea) out.push(linea);
  }
  return out;
}

/** Deja como mucho `max` renglones; si sobran, el último termina en «…» y entra en el ancho. */
export function ajustarLineas(lineas: string[], max: number, anchoMax: number, medir: Medir): string[] {
  if (lineas.length <= max) return lineas;
  const out = lineas.slice(0, Math.max(0, max));
  if (!out.length) return out;
  let ult = out[out.length - 1];
  while (ult.length > 1 && medir(`${ult}…`) > anchoMax) ult = ult.slice(0, -1);
  out[out.length - 1] = `${ult.trimEnd()}…`;
  return out;
}

// ───────────── las medidas de la placa ─────────────

export interface MedidasDeLaPlaca {
  ancho: number;
  alto: number;
  historia: boolean;
  /** Margen de los costados y ancho útil entre ellos. */
  margen: number;
  anchoUtil: number;
  /** Donde arranca el logo y donde va el renglón del pie (usuario y WhatsApp). */
  arriba: number;
  abajo: number;
  altoLogo: number;
  /** El llamado (pastilla naranja de abajo). */
  altoCta: number;
  ctaY: number;
  /** Donde arranca el cuerpo y hasta donde puede llegar. */
  cuerpoDesde: number;
  cuerpoHasta: number;
}

/**
 * Historia: Instagram tapa ~250 px arriba (el usuario) y abajo (responder): ahí no va nada. Mismos números que el
 * sistema de hoy (studio.mjs, `dibujarPieza`).
 */
export function medidasDeLaPlaca(formato: string): MedidasDeLaPlaca {
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

// ───────────── el estado del Studio ─────────────

/** Lo que manda el club al abrir el Studio (desde la difusión) o nada (desde el calendario: arranca con el ejemplo). */
export interface PiezaDelStudio {
  plantilla?: string;
  formato?: string;
  canal?: string;
  titulo?: string;
  texto?: string;
  precio?: string;
  fecha?: string;
  hora?: string;
}

export interface EstadoDelStudio {
  plantilla: ClavePlantilla;
  formato: ClaveFormato;
  valores: Valores;
  fecha: string;
  hora: string;
  /** Vino de la difusión: lo que trajo no se pisa con el ejemplo al cambiar de plantilla. */
  deLaPieza: boolean;
  /** Los campos que la persona ya tocó (o que vinieron de la pieza): el ejemplo no los pisa. */
  tocados: ClaveCampo[];
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const valoresVacios = (): Valores => Object.fromEntries(CLAVES_CAMPO.map((k) => [k, ""])) as Valores;

/** Los valores al elegir otra plantilla: lo tocado queda; lo que la plantilla usa y nadie tocó, con su ejemplo. */
export function valoresDeLaPlantilla(plantilla: ClavePlantilla, valores: Valores, tocados: readonly ClaveCampo[]): Valores {
  const P = PLANTILLAS[plantilla];
  const out = { ...valores };
  for (const k of P.campos) if (!tocados.includes(k)) out[k] = P.ejemplo[k] ?? "";
  return out;
}

/** Estado inicial a partir de la pieza que manda el club (o de nada: entonces con el ejemplo del torneo). */
export function estadoInicial(pieza: PiezaDelStudio | null | undefined, hoy: Fecha): EstadoDelStudio {
  const p = pieza && typeof pieza === "object" ? pieza : null;
  const plantilla: ClavePlantilla = p && esPlantilla(p.plantilla) ? p.plantilla : p ? (limpio(p.precio) ? "promo" : "novedad") : "torneo";
  const formato: ClaveFormato = p && esFormato(p.formato) ? p.formato : p?.canal === "historia" ? "historia" : "post";
  let valores = valoresVacios();
  if (p) for (const k of CLAVES_CAMPO) valores[k] = p[k as keyof PiezaDelStudio] == null ? "" : String(p[k as keyof PiezaDelStudio]);
  const tocados = p ? [...CLAVES_CAMPO] : [];
  valores = valoresDeLaPlantilla(plantilla, valores, tocados);
  return {
    plantilla,
    formato,
    valores,
    fecha: p && FECHA.test(p.fecha ?? "") ? p.fecha! : hoy,
    hora: p && HORA.test(p.hora ?? "") ? p.hora! : "19:00",
    deLaPieza: Boolean(p),
    tocados,
  };
}

/** La difusión que se está armando, como pieza del Studio (el botón «Hacer la imagen en el Studio»). */
export function piezaDeLaDifusion(b: { tipo: TipoNovedad; titulo: string; texto: string }): PiezaDelStudio {
  const plantilla: ClavePlantilla = b.tipo === "promo" ? "promo" : b.tipo === "torneo" ? "torneo" : b.tipo === "turnos" ? "turnos" : "novedad";
  return { plantilla, titulo: b.titulo, texto: b.texto };
}

/** Lo que se agenda en el calendario de redes (`guardarPublicacion` de novedades-core.ts). */
export interface PublicacionDelStudio {
  titulo: string;
  texto: string;
  canal: Formato["canal"];
  estado: Extract<EstadoContenido, "programado">;
  fecha: string;
  hora: string;
}

/** Lo que va al calendario, o el motivo por el que no se puede. */
export function datosParaGuardar(x: { plantilla: string; formato: string; valores: Partial<Valores>; caption: string; fecha: string; hora: string }): { ok: true; datos: PublicacionDelStudio } | { ok: false; motivo: string } {
  const P = PLANTILLAS[esPlantilla(x.plantilla) ? x.plantilla : "novedad"];
  const titulo = limpio(x.valores?.titulo) || P.nombre;
  if (!FECHA.test(x.fecha ?? "")) return { ok: false, motivo: "Elegí la fecha de publicación." };
  if (!HORA.test(x.hora ?? "")) return { ok: false, motivo: "Elegí la hora de publicación." };
  const texto = limpio(x.caption);
  if (!texto) return { ok: false, motivo: "El caption está vacío: escribí algo o tocá «Volver al sugerido»." };
  return { ok: true, datos: { titulo: titulo.slice(0, 120), texto, canal: FORMATOS[esFormato(x.formato) ? x.formato : "post"].canal, estado: "programado", fecha: x.fecha, hora: x.hora } };
}

/** breakpoint-torneo-2026-10-16.png */
export function nombreArchivo(plantilla: string, fecha: string): string {
  const p = esPlantilla(plantilla) ? plantilla : "pieza";
  return `breakpoint-${p}-${FECHA.test(fecha ?? "") ? fecha : "sin-fecha"}.png`;
}

/** La foto de fondo: sólo imágenes y hasta 15 MB (no sale del equipo). null = sirve. */
export const PESO_MAXIMO_FOTO = 15 * 1024 * 1024;
export function motivoParaNoUsarLaFoto(f: { type: string; size: number }): string | null {
  if (!/^image\//.test(f.type)) return "Eso no es una imagen: elegí una foto (JPG, PNG o WebP).";
  if (f.size > PESO_MAXIMO_FOTO) return "La foto pesa más de 15 MB: elegí una más liviana.";
  return null;
}

export const AVISO_RECORTE = "Hay texto que no entra en la placa y quedó cortado con «…»: acortalo o probá el formato Historia. El caption sí va completo.";

/** El nombre accesible de la vista previa (el lienzo es una imagen). */
export function descripcionDeLaPlaca(e: Pick<EstadoDelStudio, "plantilla" | "formato" | "valores">): string {
  return `Vista previa: ${PLANTILLAS[e.plantilla].nombre}, ${FORMATOS[e.formato].nombre.toLowerCase()}, ${limpio(e.valores.titulo) || "sin título"}`;
}
