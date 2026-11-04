// Contenido — plantillas por tipo y propuesta de 3 piezas desde el texto (PURO, determinista).
import { armarCaptionInstagram, armarCaptionWhatsApp } from "./caption";
import { detectarTipo, extraer } from "./detectar";
import type {
  CamposDeLaPieza,
  ClaveFormato,
  Extraccion,
  MarcaDeLaPlaca,
  PiezaPropuesta,
  TipoDeContenido,
  Variante,
} from "./tipos";

/**
 * Cómo arma los campos la plantilla:
 * - `dato`: el dato fuerte del tipo (precio, horario, fecha) va de título y el título del texto baja.
 * - `titulo`: título y bajada del texto.
 * - `detalle`: título del texto y, de bajada, los detalles (fecha · hora · precio) o la bajada.
 */
export type Enfoque = "dato" | "titulo" | "detalle";

export interface Plantilla {
  id: string;
  tipo: TipoDeContenido;
  nombre: string;
  variante: Variante;
  rotulo: string;
  enfoque: Enfoque;
}

const p = (tipo: TipoDeContenido, variante: Variante, nombre: string, rotulo: string, enfoque: Enfoque): Plantilla =>
  Object.freeze({ id: `${tipo}-${variante}`, tipo, nombre, variante, rotulo, enfoque });

export const PLANTILLAS_POR_TIPO: Readonly<Record<TipoDeContenido, readonly [Plantilla, Plantilla, Plantilla]>> = Object.freeze({
  promo: [p("promo", "bloque", "Precio grande", "Promo", "dato"), p("promo", "franja", "Franja de oferta", "Por tiempo limitado", "titulo"), p("promo", "tarjeta", "Tarjeta de oferta", "Oferta", "detalle")],
  horario: [p("horario", "bloque", "Horario grande", "Horarios", "dato"), p("horario", "franja", "Aviso con franja", "Atención", "titulo"), p("horario", "tarjeta", "Tarjeta de horarios", "Te esperamos", "detalle")],
  evento: [p("evento", "bloque", "Fecha grande", "Evento", "dato"), p("evento", "franja", "Convocatoria", "Inscripciones abiertas", "titulo"), p("evento", "tarjeta", "Ficha del evento", "Agendalo", "detalle")],
  novedad: [p("novedad", "bloque", "Anuncio", "Novedad", "titulo"), p("novedad", "franja", "Franja", "Lo nuevo", "detalle"), p("novedad", "tarjeta", "Tarjeta", "Enterate", "dato")],
  servicio: [p("servicio", "bloque", "Lanzamiento", "Nuevo servicio", "titulo"), p("servicio", "franja", "Franja", "Ahora también", "detalle"), p("servicio", "tarjeta", "Tarjeta", "Reservá", "dato")],
});

export function plantillaPorId(id: string): Plantilla | undefined {
  for (const lista of Object.values(PLANTILLAS_POR_TIPO)) {
    const hallada = lista.find((x) => x.id === id);
    if (hallada) return hallada;
  }
  return undefined;
}

/** El dato fuerte de cada tipo. */
function datoFuerte(tipo: TipoDeContenido, ex: Extraccion): string | undefined {
  if (tipo === "promo") return ex.precio;
  if (tipo === "horario") return ex.hora;
  if (tipo === "evento") return ex.fecha ? [ex.fecha, ex.hora].filter(Boolean).join(" · ") : ex.hora;
  return ex.precio ?? ex.fecha;
}

const detalles = (ex: Extraccion) =>
  [ex.fecha && `Fecha: ${ex.fecha}`, ex.hora && `Horario: ${ex.hora}`, ex.precio && `Precio: ${ex.precio}`].filter(Boolean).join(" · ");

/** Los campos de la placa según la plantilla. */
export function camposDePlantilla(plantilla: Plantilla, ex: Extraccion): CamposDeLaPieza {
  const titulo = ex.titulo || plantilla.rotulo;
  const base = { rotulo: plantilla.rotulo, cta: ex.cta };
  const dato = datoFuerte(plantilla.tipo, ex);
  if (plantilla.enfoque === "dato" && dato && dato !== titulo) return { ...base, titulo: dato, bajada: titulo };
  if (plantilla.enfoque === "detalle") return { ...base, titulo, bajada: detalles(ex) || ex.bajada };
  return { ...base, titulo, bajada: ex.bajada || detalles(ex) };
}

/**
 * Tres piezas distintas (una por variante) con la marca del negocio y sus captions de Instagram y WhatsApp.
 * `tipo` fuerza el tipo (el selector de la pantalla); si no, se detecta.
 */
export function proponerPiezas(
  texto: string,
  marca: MarcaDeLaPlaca,
  tipo?: TipoDeContenido,
  opciones: { formato?: ClaveFormato } = {},
): PiezaPropuesta[] {
  const t = tipo ?? detectarTipo(texto).tipo;
  const formato = opciones.formato ?? "post";
  const ex = extraer(texto, { tipo: t, canal: formato === "historia" ? "historia" : "instagram" });
  return PLANTILLAS_POR_TIPO[t].map((pl) => {
    const campos = camposDePlantilla(pl, ex);
    const datos = { tipo: t, campos, marca, detalles: { fecha: ex.fecha, hora: ex.hora, precio: ex.precio } };
    return {
      plantilla: pl.id,
      tipo: t,
      variante: pl.variante,
      formato,
      campos,
      caption: { instagram: armarCaptionInstagram(datos), whatsapp: armarCaptionWhatsApp(datos) },
    };
  });
}
