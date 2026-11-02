// DISEÑO, CHAT E IA — reglas puras: láminas, referencias de imagen, revisión interna y límites de los agentes.
// Sin base ni React, para probarlas sin nada alrededor.

import type { ModuloGestion } from "./gestion-core";

export const SUBPESTANAS = [
  { id: "tareas", label: "Tareas" },
  { id: "versiones", label: "Versiones" },
  { id: "idea", label: "Idea" },
  { id: "estudio", label: "Estudio" },
  { id: "presentaciones", label: "Presentaciones" },
] as const;
export type SubPestana = (typeof SUBPESTANAS)[number]["id"];

export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "–";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export function linkSeguro(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    return new URL(u.trim()).protocol === "https:" ? u.trim() : null;
  } catch {
    return null;
  }
}

// ── Imágenes ────────────────────────────────────────────────────────────────

/** Lo que guarda la idea en `imagenes`: el id de una versión, `archivo:<id>`, o un link https. */
export type RefImagen = { tipo: "version" | "archivo"; id: string } | { tipo: "url"; url: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function leerRef(ref: unknown): RefImagen | null {
  if (typeof ref !== "string") return null;
  const url = linkSeguro(ref);
  if (url) return { tipo: "url", url };
  if (ref.startsWith("archivo:")) {
    const id = ref.slice("archivo:".length);
    return ID.test(id) ? { tipo: "archivo", id } : null;
  }
  return ID.test(ref) ? { tipo: "version", id: ref } : null;
}

/** Dirección para un <img>. Las imágenes viven en la base y se sirven con permiso: nunca viajan embebidas en la página. */
export function srcDeImagen(ref: unknown): string | null {
  const r = leerRef(ref);
  if (!r) return null;
  if (r.tipo === "url") return r.url;
  return `/admin/proyectos/diseno/imagen/${r.tipo === "archivo" ? "a" : "v"}-${r.id}`;
}

/** Lo que recibe la ruta de imagen: `v-<id>` o `a-<id>`. */
export function leerClaveImagen(clave: string): { tipo: "version" | "archivo"; id: string } | null {
  const m = /^([va])-([A-Za-z0-9_-]{1,64})$/.exec(clave);
  return m ? { tipo: m[1] === "a" ? "archivo" : "version", id: m[2] } : null;
}

export function partirDataUrl(datos: string): { tipo: string; base64: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(datos);
  return m ? { tipo: m[1], base64: m[2] } : null;
}

export function normalizarImagenes(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => leerRef(x) !== null))];
}

export interface Moodboard {
  nombre: string;
  link: string;
}

export function normalizarMoodboards(v: unknown): Moodboard[] {
  if (!Array.isArray(v)) return [];
  const salida: Moodboard[] = [];
  for (const m of v) {
    const link = linkSeguro((m as { link?: unknown } | null)?.link);
    const nombre = (m as { nombre?: unknown } | null)?.nombre;
    if (link) salida.push({ nombre: typeof nombre === "string" && nombre.trim() ? nombre.trim() : link, link });
  }
  return salida;
}

export const ETIQUETA_ESTUDIO = "Estudio: ";
export const esDelEstudio = (nombre: string): boolean => nombre.startsWith(ETIQUETA_ESTUDIO);

export const VARIANTES_ESTUDIO = ["De noche, con luces cálidas", "Vista aérea", "Vista desde el público", "Con invitados en escena", "Materiales nobles", "Más minimalista", "Más colorido", "Con pantallas LED protagonistas"] as const;

export function sumarVariante(pedido: string, variante: string): string {
  const base = pedido.trim();
  if (base.toLowerCase().includes(variante.toLowerCase())) return pedido;
  return base ? `${base.replace(/[.,;]$/, "")}. ${variante}.` : `${variante}.`;
}

// ── Revisión interna de una versión ─────────────────────────────────────────

// El estado de la versión es el del circuito con el cliente, y todo lo que no es borrador ya lo ve en su link: la revisión
// interna no puede tocarlo. Queda como un comentario marcado, con su autor y fecha.
const MARCA_APROBADA = "[[revision:aprobada]]";
const MARCA_CAMBIOS = "[[revision:cambios]]";

export type RevisionInterna = "APROBADA" | "CAMBIOS" | null;

export const textoDeRevision = (tipo: "APROBADA" | "CAMBIOS", nota: string): string => `${tipo === "APROBADA" ? MARCA_APROBADA : MARCA_CAMBIOS}${nota.trim()}`;

export function leerRevision(texto: string): { tipo: RevisionInterna; nota: string } {
  if (texto.startsWith(MARCA_APROBADA)) return { tipo: "APROBADA", nota: texto.slice(MARCA_APROBADA.length) };
  if (texto.startsWith(MARCA_CAMBIOS)) return { tipo: "CAMBIOS", nota: texto.slice(MARCA_CAMBIOS.length) };
  return { tipo: null, nota: texto };
}

/** Nadie se aprueba una pieza escribiendo la marca a mano en un comentario. */
export const textoDeComentario = (texto: string): string => texto.trim().replace(/^\[\[revision:[a-z]*\]\]\s*/i, "").slice(0, 1000);

export const esMarcaDeRevision = (texto: string): boolean => leerRevision(texto).tipo !== null;

/** Manda la última revisión. */
export function revisionVigente(comentarios: readonly { texto: string; createdAt: Date }[]): RevisionInterna {
  let tipo: RevisionInterna = null;
  let cuando = -Infinity;
  for (const c of comentarios) {
    const r = leerRevision(c.texto).tipo;
    if (r && c.createdAt.getTime() >= cuando) {
      tipo = r;
      cuando = c.createdAt.getTime();
    }
  }
  return tipo;
}

const ESTADO_VERSION: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Con el cliente",
  APROBADA: "Aprobada por el cliente",
  CAMBIOS: "El cliente pidió cambios",
  REEMPLAZADA: "Reemplazada",
};

export function estadoDeVersion(estado: string, revision: RevisionInterna): string {
  if (estado === "BORRADOR" && revision === "APROBADA") return "Aprobada internamente";
  if (estado === "BORRADOR" && revision === "CAMBIOS") return "Cambios pedidos";
  return ESTADO_VERSION[estado] ?? estado;
}

export function puntoEnImagen(x: unknown, y: unknown): { x: number; y: number } | null {
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
  return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) }; // no-es-plata: posición en la imagen, en %
}

/** El número de cada comentario con punto, por orden de llegada. */
export function numerarPuntos(comentarios: readonly { id: string; x: number | null; createdAt: Date }[]): Map<string, number> {
  const orden = comentarios.filter((c) => c.x != null).slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return new Map(orden.map((c, i) => [c.id, i + 1]));
}

// ── Presentaciones ──────────────────────────────────────────────────────────

export const PLANTILLAS = [
  { id: "CLASICA", label: "Clásica oscura", ayuda: "Fondo oscuro, texto claro" },
  { id: "EDITORIAL", label: "Editorial clara", ayuda: "Fondo claro, mucho aire" },
  { id: "CLIENTE", label: "Colores del cliente", ayuda: "Elegís su color de fondo y su acento" },
] as const;
export type Plantilla = (typeof PLANTILLAS)[number]["id"];
export const esPlantilla = (v: unknown): v is Plantilla => PLANTILLAS.some((p) => p.id === v);

export const ESTADOS_PRESENTACION: Record<string, string> = { BORRADOR: "Borrador", ENVIADA: "Enviada", APROBADA: "Aprobada por el cliente", CAMBIOS: "El cliente pidió cambios" };

const HEX = /^#[0-9a-fA-F]{6}$/;
export const colorValido = (c: unknown): c is string => typeof c === "string" && HEX.test(c);

/** Negro o blanco, lo que se lea mejor sobre ese fondo (WCAG). */
export function textoSobre(fondo: string): string {
  const canal = (i: number) => {
    const v = parseInt(fondo.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luz = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  return (luz + 0.05) / 0.05 >= 1.05 / (luz + 0.05) ? "#000000" : "#ffffff";
}

export interface ColoresLamina {
  fondo: string;
  texto: string;
  acento: string;
}

export interface Lamina {
  tipo: "portada" | "texto" | "lista" | "imagen" | "cierre";
  titulo: string;
  texto?: string;
  items?: string[];
  imagen?: string;
  colores?: ColoresLamina;
}

export interface DatosPresentacion {
  nombre: string;
  cliente: string;
  negocio: string;
  tipoEvento?: string | null;
  lugar?: string | null;
  fecha?: string | null;
  invitados?: number | null;
  brief: string;
  concepto: string;
  narrativa: string;
  materialidades: string;
  referencias: string;
  imagenes: readonly string[];
}

const TOPE_LAMINA = 700;

/** Un texto largo sigue en la lámina siguiente: no se corta ni se achica hasta que no se lea. */
export function partirTexto(texto: string, tope: number = TOPE_LAMINA): string[] {
  const partes: string[] = [];
  let actual = "";
  const sumar = (trozo: string, sep: string) => {
    if (actual && actual.length + sep.length + trozo.length > tope) {
      partes.push(actual);
      actual = trozo;
    } else {
      actual = actual ? actual + sep + trozo : trozo;
    }
  };
  for (const parrafo of texto.trim().split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (parrafo.length <= tope) {
      sumar(parrafo, "\n\n");
      continue;
    }
    for (const oracion of parrafo.match(/[^.!?]+[.!?]*\s*/g) ?? [parrafo]) sumar(oracion.trim(), " ");
  }
  if (actual) partes.push(actual);
  return partes;
}

const renglones = (t: string): string[] => t.split(/\r?\n/).map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);

/**
 * La presentación se arma con reglas: no hace falta IA. Sale lo que está cargado y nada inventado; una sección vacía no
 * genera lámina. La «información importante» de la idea no viaja: es para el equipo. Sin concepto ni brief, no hay qué mostrar.
 */
export function armarLaminas(d: DatosPresentacion, colores?: { fondo: string; acento: string } | null): Lamina[] {
  if (!d.concepto.trim() && !d.brief.trim()) return [];
  const laminas: Lamina[] = [];
  const conTexto = (titulo: string, texto: string) => {
    partirTexto(texto).forEach((t, i) => laminas.push({ tipo: "texto", titulo: i === 0 ? titulo : `${titulo} (sigue)`, texto: t }));
  };
  laminas.push({ tipo: "portada", titulo: d.nombre, texto: [d.cliente, d.negocio && `Propuesta de ${d.negocio}`].filter(Boolean).join(" · ") });
  const datos = [d.tipoEvento, d.lugar, d.fecha, d.invitados ? `${d.invitados} invitados` : null].filter((x): x is string => !!x);
  if (datos.length > 0) laminas.push({ tipo: "lista", titulo: "El evento", items: datos });
  if (d.brief.trim()) conTexto("Lo que nos pidieron", d.brief);
  if (d.concepto.trim()) conTexto("La idea", d.concepto);
  if (d.narrativa.trim()) conTexto("Cómo se cuenta", d.narrativa);
  for (const imagen of d.imagenes) if (leerRef(imagen)) laminas.push({ tipo: "imagen", titulo: d.nombre, imagen });
  if (renglones(d.materialidades).length > 0) laminas.push({ tipo: "lista", titulo: "Materiales y terminaciones", items: renglones(d.materialidades) });
  if (renglones(d.referencias).length > 0) laminas.push({ tipo: "lista", titulo: "Referencias", items: renglones(d.referencias) });
  laminas.push({ tipo: "cierre", titulo: "¿Seguimos?", texto: "Decinos qué te gusta y qué cambiarías: con eso ajustamos la propuesta." });
  if (colores && colorValido(colores.fondo) && colorValido(colores.acento)) {
    const paleta: ColoresLamina = { fondo: colores.fondo, acento: colores.acento, texto: textoSobre(colores.fondo) };
    return laminas.map((l) => ({ ...l, colores: paleta }));
  }
  return laminas;
}

/** Lo que vuelve de la base se vuelve a validar antes de dibujarlo. */
export function leerLaminas(v: unknown): Lamina[] {
  if (!Array.isArray(v)) return [];
  const tipos = ["portada", "texto", "lista", "imagen", "cierre"];
  const salida: Lamina[] = [];
  for (const crudo of v) {
    const l = crudo as Partial<Lamina> | null;
    if (!l || !tipos.includes(String(l.tipo))) continue;
    const c = l.colores;
    salida.push({
      tipo: l.tipo as Lamina["tipo"],
      titulo: typeof l.titulo === "string" ? l.titulo : "",
      texto: typeof l.texto === "string" ? l.texto : undefined,
      items: Array.isArray(l.items) ? l.items.filter((x): x is string => typeof x === "string") : undefined,
      imagen: typeof l.imagen === "string" ? l.imagen : undefined,
      colores: c && colorValido(c.fondo) && colorValido(c.texto) && colorValido(c.acento) ? c : undefined,
    });
  }
  return salida;
}

// ── Agentes ─────────────────────────────────────────────────────────────────

export const AGENTES = [
  {
    id: "creativo",
    nombre: "Creativo",
    ayuda: "Conceptos, narrativas y caminos creativos para el evento.",
    exige: ["diseno"],
    sugerencias: ["Proponé tres caminos de concepto para este evento", "Escribí la narrativa de la idea para contársela al cliente", "¿Qué le falta al brief para poder pensar una idea?"],
  },
  {
    id: "disenador",
    nombre: "Diseñador",
    ayuda: "Materialidades, pedidos para imágenes y devoluciones de diseño.",
    exige: ["diseno"],
    sugerencias: ["Sugerí materialidades coherentes con el concepto", "Escribí un pedido de imagen para el Estudio", "Ordená las tareas de diseño por prioridad"],
  },
  {
    id: "productor",
    nombre: "Productor",
    ayuda: "Rubros, proveedores a cotizar, fechas y riesgos de producción.",
    exige: ["ficha"],
    sugerencias: ["¿Qué rubros faltan en la ficha para este tipo de evento?", "Armá un mail para pedirle cotización a un proveedor", "¿Qué riesgos ves en este evento?"],
  },
  {
    id: "administrador",
    nombre: "Administrador",
    ayuda: "Cobros, pagos y vencimientos: prepara el texto, no mueve plata.",
    exige: ["pagos"],
    sugerencias: ["¿Qué vence en los próximos días?", "Escribí un recordatorio de cobro para el cliente", "Resumí la situación de cobros y pagos"],
  },
  {
    id: "asistente",
    nombre: "Asistente",
    ayuda: "Lo cotidiano: resúmenes, minutas y mensajes para el equipo.",
    exige: ["pipeline"],
    sugerencias: ["Resumí en qué estado está este evento", "Redactá un mensaje al equipo con lo pendiente", "¿Qué tengo para hacer esta semana?"],
  },
] as const satisfies readonly { id: string; nombre: string; ayuda: string; exige: readonly ModuloGestion[]; sugerencias: readonly string[] }[];

export type AgenteId = (typeof AGENTES)[number]["id"];
export const esAgente = (v: unknown): v is AgenteId => AGENTES.some((a) => a.id === v);

export function agenteBloqueado(id: AgenteId, puedeVer: (m: ModuloGestion) => boolean): boolean {
  const agente = AGENTES.find((a) => a.id === id);
  return !agente || !agente.exige.every((m) => puedeVer(m));
}

export interface MensajeAgente {
  rol: "user" | "assistant";
  texto: string;
}

const TOPE_HISTORIAL = 24;
const TOPE_MENSAJE = 6000;

/** La charla la guarda el navegador: del otro lado se la revisa entera antes de usarla. */
export function validarHistorial(v: unknown): MensajeAgente[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > TOPE_HISTORIAL) return null;
  const salida: MensajeAgente[] = [];
  for (let i = 0; i < v.length; i++) {
    const m = v[i] as Partial<MensajeAgente> | null;
    const esperado = i % 2 === 0 ? "user" : "assistant";
    if (m?.rol !== esperado || typeof m.texto !== "string" || !m.texto.trim()) return null;
    if (m.texto.length > (m.rol === "user" ? TOPE_MENSAJE : TOPE_MENSAJE * 4)) return null;
    salida.push({ rol: m.rol, texto: m.texto });
  }
  return salida[salida.length - 1].rol === "user" ? salida : null;
}

/** Los datos del negocio viajan como datos: quien escribió el brief no puede abrir ni cerrar el bloque. */
export const escaparDatos = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function bloqueDeDatos(secciones: readonly { titulo: string; lineas: readonly string[] }[]): string {
  const cuerpo = secciones
    .filter((s) => s.lineas.length > 0)
    .map((s) => `## ${escaparDatos(s.titulo)}\n${s.lineas.map(escaparDatos).join("\n")}`)
    .join("\n\n");
  return `<datos>\n${cuerpo || "Sin datos a la vista para tu rol."}\n</datos>`;
}

/** Etapas anteriores a Confirmado: ahí se arma la propuesta. */
export const ETAPAS_PROPUESTA = ["PEDIDO", "DISENO", "RENDER", "PRESUPUESTO", "PROPUESTA"] as const;
export const PASOS_PROPUESTA = [
  { id: "concepto", label: "Concepto" },
  { id: "imagenes", label: "Imágenes" },
  { id: "presentacion", label: "Presentación" },
] as const;
