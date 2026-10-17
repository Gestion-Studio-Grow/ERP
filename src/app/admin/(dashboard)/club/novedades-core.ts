// ============================================================================
// NOVEDADES Y REDES — la difusión por WhatsApp, las bajas y el calendario de contenido. PURO.
// ============================================================================
//
// Paridad con la pestaña «Novedades y redes» del club vanilla (public/previews/breakpoint/club/app.mjs:
// `vistaContenido`, `seccionDifusion`, `listaEnvio`, `contenidoDialogo` y las acciones `armarDifusion`,
// `copiarDifusion`, `csvDifusion`, `data-envio`, `guardarContenido`, `borrarContenido`):
//   · se arma la novedad (tipo, título, texto) y se elige a quién le llega (todos, los que jugaron en los últimos
//     30 días, los que no vienen hace más de 30, los que tienen cuenta corriente). Le llega a los clientes activos
//     con celular que NO pidieron la baja (`destinatarios` del motor);
//   · «Preparar el envío» (`crearDifusion`) deja los dos caminos: la LISTA DE DIFUSIÓN de WhatsApp Business (copiar
//     el mensaje + descargar los contactos en CSV) o UNO POR UNO (cada nombre abre WhatsApp con el mensaje listo y
//     queda tildado: `marcarEnviado`). Sin API de WhatsApp no hay envío masivo automático: lo manda una persona;
//   · el mensaje termina con «respondé BAJA»; al que la pide se le da la baja acá o en su ficha (`bajaNovedades`) y
//     no le llega más (si la pidió con un envío a medias, en la lista figura «pidió la baja», sin link);
//   · el historial de lo que se mandó, con «Seguir mandando»;
//   · el calendario de redes del mes (`contenido`: Instagram post/reel/historia y WhatsApp; idea → programado →
//     publicado), con alta, edición y borrado.
// El STUDIO DE REDES (studio.mjs: imágenes con la marca del club) NO se porta: queda en el sistema de hoy (G6).
// Las reglas son del motor; acá se arma lo que se ve y se traduce cada toque (novedades-core.test.ts).

import {
  AUDIENCIAS,
  CANALES,
  ESTADOS_CONTENIDO,
  TIPOS_NOVEDAD,
  agregarContenido,
  bajaNovedades,
  borrarContenido,
  buscarClientes,
  cliente as clienteDe,
  contactosCSV,
  contenidoDelMes,
  crearDifusion,
  destinatarios,
  diaSemana,
  editarContenido,
  hhmm,
  marcarEnviado,
  mensajeDifusion,
  puede,
} from "@/lib/club/motor.mjs";
import type { Ahora, Audiencia, Auth, CanalContenido, EstadoClub, EstadoContenido, Fecha, TipoNovedad } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { enlaceWhatsApp, type EnlaceWhatsApp, type ModoDelClub } from "./whatsapp-core";

const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;
const opciones = <K extends string>(r: Readonly<Record<K, string>>) => (Object.entries(r) as [K, string][]).map(([valor, etiqueta]) => ({ valor, etiqueta }));

export const OPCIONES_TIPO = opciones<TipoNovedad>(TIPOS_NOVEDAD);
export const OPCIONES_AUDIENCIA = opciones<Audiencia>(AUDIENCIAS);
export const OPCIONES_CANAL = opciones<CanalContenido>(CANALES);
export const OPCIONES_ESTADO_CONTENIDO = opciones<EstadoContenido>(ESTADOS_CONTENIDO);

/** El largo que acepta el motor (lo recorta: la pantalla lo pone como tope del campo). */
export const LARGO_TITULO = 80;
export const LARGO_TEXTO = 900;

// ───────────── armar la novedad ─────────────

export interface Borrador {
  tipo: TipoNovedad;
  titulo: string;
  texto: string;
  audiencia: Audiencia;
}

export const BORRADOR_VACIO: Borrador = Object.freeze({ tipo: "novedad", titulo: "", texto: "", audiencia: "todos" });

/** A cuántos les llega y cómo se ve (con un nombre de ejemplo, como el vanilla: «Juan»). */
export function vistaPrevia(estado: EstadoClub, ahora: Ahora, b: Borrador): { cuantos: number; mensaje: string } {
  return { cuantos: destinatarios(estado, b.audiencia, ahora).length, mensaje: mensajeDifusion({ titulo: b.titulo.trim() || "Título de la novedad", texto: b.texto.trim() }, "Juan") };
}

// ───────────── el envío ─────────────

export interface ContactoDelEnvio {
  clienteId: string;
  nombre: string;
  /** Ya se le mandó (tocó su nombre). */
  hecho: boolean;
  /** Pidió la baja después de armar la novedad: no se le manda (sin link). */
  baja: boolean;
  enlace: EnlaceWhatsApp | null;
}

export interface VistaEnvio {
  id: string;
  titulo: string;
  /** El mensaje sin nombre (el que se pega en la lista de difusión). */
  mensaje: string;
  /** A cuántos se les puede mandar (sin los que pidieron la baja). */
  total: number;
  enviados: number;
  contactos: ContactoDelEnvio[];
  /** Por qué los links abren sin número (la demo), una sola vez para toda la lista. */
  nota: string | null;
  firma: string;
}

export function armarEnvio(estado: EstadoClub, difusionId: string | null, modo: ModoDelClub): VistaEnvio | null {
  const d = difusionId ? estado.difusiones.find((x) => x.id === difusionId) : null;
  if (!d) return null;
  const contactos: ContactoDelEnvio[] = d.destinatarios
    .map((id) => clienteDe(estado, id))
    .filter((c) => !!c && c.activo !== false)
    .map((c) => {
      const baja = c!.aceptaNovedades === false;
      return {
        clienteId: c!.id,
        nombre: c!.nombre,
        hecho: d.enviados.includes(c!.id),
        baja,
        enlace: baja ? null : enlaceWhatsApp(c!.tel, mensajeDifusion(d, c!.nombre), modo),
      };
    });
  const vigentes = contactos.filter((c) => !c.baja);
  const notas = [...new Set(vigentes.map((c) => c.enlace?.nota).filter(Boolean))];
  const vista = {
    id: d.id,
    titulo: d.titulo,
    mensaje: mensajeDifusion(d),
    total: vigentes.length,
    enviados: vigentes.filter((c) => c.hecho).length,
    contactos,
    nota: notas.length === 1 ? notas[0]! : notas.length > 1 ? "Algunos no tienen un celular argentino cargado: WhatsApp abre para que elijas el chat." : null,
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

/** Los contactos de la lista de difusión (CSV «Nombre,Celular», con BOM para que Excel lea los acentos). */
export function csvDeLaDifusion(estado: EstadoClub, difusionId: string, hoy: Fecha): { archivo: string; texto: string; cuantos: number } | null {
  const d = estado.difusiones.find((x) => x.id === difusionId);
  if (!d) return null;
  const lista = d.destinatarios
    .map((id) => clienteDe(estado, id))
    .filter((c) => !!c && c.activo !== false && c.aceptaNovedades !== false && String(c.tel ?? "").replace(/\D/g, "").length >= 8)
    .map((c) => ({ nombre: c!.nombre, tel: String(c!.tel).replace(/\D/g, "") }));
  return { archivo: `novedades-del-club-${hoy}.csv`, texto: `﻿${contactosCSV(lista)}`, cuantos: lista.length };
}

// ───────────── el historial ─────────────

export interface FilaDifusion {
  id: string;
  cuando: string;
  titulo: string;
  tipo: string;
  audiencia: string;
  enviados: number;
  total: number;
  autor: string;
}

/** Lo que se armó, de lo más nuevo a lo más viejo (el motor agrega adelante). */
export function armarHistorial(estado: EstadoClub): { filas: FilaDifusion[]; firma: string } {
  const filas = estado.difusiones.map((d) => ({
    id: d.id,
    cuando: `${d.fecha ? ddmm(d.fecha) : ""}${d.min != null ? ` ${hhmm(d.min)}` : ""}`.trim(),
    titulo: d.titulo,
    tipo: TIPOS_NOVEDAD[d.tipo] ?? d.tipo,
    audiencia: AUDIENCIAS[d.audiencia] ?? d.audiencia,
    enviados: d.enviados.length,
    total: d.destinatarios.length,
    autor: d.autor,
  }));
  return { filas, firma: JSON.stringify(filas) };
}

// ───────────── las bajas («respondé BAJA») ─────────────

export interface ClienteDeLaBaja {
  id: string;
  nombre: string;
  tel: string;
}

export interface VistaBajas {
  /** Los que reciben y coinciden con lo buscado (hasta 6; vacío sin búsqueda). */
  candidatos: ClienteDeLaBaja[];
  /** Los que pidieron no recibir más. */
  deBaja: ClienteDeLaBaja[];
  firma: string;
}

export function armarBajas(estado: EstadoClub, texto: string): VistaBajas {
  const fila = (c: { id: string; nombre: string; tel: string }) => ({ id: c.id, nombre: c.nombre, tel: c.tel });
  const candidatos = texto.trim() ? buscarClientes(estado, texto).filter((c) => c.aceptaNovedades !== false).slice(0, 6).map(fila) : [];
  const deBaja = estado.clientes
    .filter((c) => c.activo !== false && c.aceptaNovedades === false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map(fila);
  const vista = { candidatos, deBaja };
  return { ...vista, firma: JSON.stringify(vista) };
}

// ───────────── el calendario de contenido ─────────────

/** «2026-10» de una fecha. */
export const mesDe = (f: Fecha) => f.slice(0, 7);

/** El mes de al lado: «2026-10» + 1 → «2026-11»; + -10 → «2025-12». */
export function mesVecino(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Lo que distingue cada estado además del color (nunca sólo el color). */
export const MARCA_ESTADO: Record<EstadoContenido, string> = { idea: "○", programado: "◷", publicado: "✔" };

export interface PublicacionDelDia {
  id: string;
  hora: string;
  titulo: string;
  estado: EstadoContenido;
  /** «19:00 · Torneo del sábado · Instagram · post · Programado»: el nombre accesible. */
  descripcion: string;
}

export interface DiaDelCalendario {
  fecha: Fecha;
  numero: number;
  hoy: boolean;
  publicaciones: PublicacionDelDia[];
}

export interface VistaCalendario {
  mes: string;
  /** «octubre de 2026». */
  titulo: string;
  /** Huecos antes del día 1 (la semana arranca el lunes). */
  vacias: number;
  dias: DiaDelCalendario[];
  /** «Idea: 1 · Programado: 2 · Publicado: 0». */
  resumen: string;
  total: number;
  firma: string;
}

export function armarCalendario(estado: EstadoClub, mes: string, hoy: Fecha): VistaCalendario {
  const [anio, m] = mes.split("-").map(Number);
  const pubs = contenidoDelMes(estado, anio, m);
  const diasMes = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  const dias: DiaDelCalendario[] = [];
  for (let d = 1; d <= diasMes; d++) {
    const fecha = `${mes}-${String(d).padStart(2, "0")}`;
    dias.push({
      fecha,
      numero: d,
      hoy: fecha === hoy,
      publicaciones: pubs
        .filter((p) => p.fecha === fecha)
        .map((p) => ({
          id: p.id,
          hora: p.hora,
          titulo: p.titulo,
          estado: p.estado,
          descripcion: `${p.hora} · ${p.titulo} · ${CANALES[p.canal] ?? p.canal} · ${ESTADOS_CONTENIDO[p.estado] ?? p.estado}`,
        })),
    });
  }
  const resumen = OPCIONES_ESTADO_CONTENIDO.map((o) => `${o.etiqueta}: ${pubs.filter((p) => p.estado === o.valor).length}`).join(" · ");
  const titulo = new Date(Date.UTC(anio, m - 1, 1)).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  const vista = { mes, titulo, vacias: (diaSemana(`${mes}-01`) + 6) % 7, dias, resumen, total: pubs.length };
  return { ...vista, firma: JSON.stringify(vista) };
}

export interface DatosPublicacion {
  fecha: string;
  hora: string;
  canal: CanalContenido;
  estado: EstadoContenido;
  titulo: string;
  texto: string;
}

/** Lo que se carga al abrir una publicación (la existente o una nueva para esa fecha, a las 19:00 como el vanilla). */
export function datosDePublicacion(estado: EstadoClub, id: string | null, fecha: Fecha): DatosPublicacion {
  const c = id ? estado.contenido.find((x) => x.id === id) : null;
  return c
    ? { fecha: c.fecha, hora: c.hora, canal: c.canal, estado: c.estado, titulo: c.titulo, texto: c.texto }
    : { fecha, hora: "19:00", canal: "post", estado: "idea", titulo: "", texto: "" };
}

// ───────────── lo que se toca ─────────────

export type AccionNovedades =
  | { tipo: "preparar"; borrador: Borrador }
  /** Tocó el nombre en «uno por uno»: queda tildado. */
  | { tipo: "enviado"; difusionId: string; clienteId: string }
  /** Respondió BAJA (`volver`: se lo vuelve a sumar). */
  | { tipo: "baja"; clienteId: string; volver: boolean }
  | { tipo: "guardarPublicacion"; id: string | null; datos: DatosPublicacion }
  | { tipo: "borrarPublicacion"; id: string };

export interface DesenlaceNovedades extends Desenlace {
  /** La novedad recién armada (la pantalla abre su envío). */
  difusionId?: string;
}

const falla = (r: { motivo: string }): DesenlaceNovedades => ({ ok: false, mensaje: r.motivo });
const pila = (nombre: string) => nombre.split(" ")[0];

export function ejecutarNovedades(estado: EstadoClub, accion: AccionNovedades, ahora: Ahora, auth: Auth): DesenlaceNovedades {
  switch (accion.tipo) {
    case "preparar": {
      const b = accion.borrador;
      const r = crearDifusion(estado, { tipo: b.tipo, titulo: b.titulo, texto: b.texto, audiencia: b.audiencia }, auth, ahora);
      if (!r.ok) return falla(r);
      if (!r.destinatarios.length) {
        // El motor la arma igual; sin nadie a quien mandarle no sirve: se saca y se dice por qué.
        estado.difusiones = estado.difusiones.filter((d) => d.id !== r.difusion.id);
        return { ok: false, mensaje: "No le llega a nadie: no hay clientes con celular (y sin la baja) en ese grupo." };
      }
      return { ok: true, mensaje: `Listo para mandar a ${r.destinatarios.length} cliente(s).`, difusionId: r.difusion.id };
    }
    case "enviado": {
      // El motor no pide permiso para tildar: lo pide la pantalla (es de quien arma las novedades).
      if (!puede(estado, auth.usuarioId ?? "", "contenido")) return { ok: false, mensaje: "Las novedades las manda un dueño." };
      const d = estado.difusiones.find((x) => x.id === accion.difusionId);
      const c = clienteDe(estado, accion.clienteId);
      if (!d || !c || !d.destinatarios.includes(c.id)) return { ok: false, mensaje: "Ese cliente no está en esta novedad." };
      if (c.aceptaNovedades === false) return { ok: false, mensaje: `${c.nombre} pidió la baja: no se le manda.` };
      const r = marcarEnviado(estado, d.id, c.id);
      if (!r.ok) return falla(r);
      return { ok: true, mensaje: r.faltan ? `Anotado: le mandaste a ${pila(c.nombre)}. Faltan ${r.faltan}.` : `Anotado: le mandaste a ${pila(c.nombre)}. ¡Ya les llegó a todos!` };
    }
    case "baja": {
      if (!puede(estado, auth.usuarioId ?? "", "clientes")) return { ok: false, mensaje: "Elegí quién está usando el sistema." };
      const c = clienteDe(estado, accion.clienteId);
      if (!c || c.activo === false) return { ok: false, mensaje: "No encuentro al cliente." };
      const r = bajaNovedades(estado, c.id, ahora, accion.volver);
      if (!r.ok) return falla(r);
      return { ok: true, mensaje: accion.volver ? `${c.nombre} vuelve a recibir las novedades del club.` : `${c.nombre} no recibe más novedades: ya no le llega.` };
    }
    case "guardarPublicacion": {
      const x = accion.datos;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.hora)) return { ok: false, mensaje: "Elegí la hora." };
      const datos = { fecha: x.fecha, hora: x.hora, canal: x.canal, estado: x.estado, titulo: x.titulo.trim(), texto: x.texto.slice(0, 2000) };
      const r = accion.id ? editarContenido(estado, accion.id, datos, auth) : agregarContenido(estado, datos, auth);
      return r.ok ? { ok: true, mensaje: accion.id ? "Publicación guardada." : `Publicación agendada para el ${ddmm(x.fecha)}.` } : falla(r);
    }
    case "borrarPublicacion": {
      const titulo = estado.contenido.find((c) => c.id === accion.id)?.titulo;
      const r = borrarContenido(estado, accion.id, auth);
      return r.ok ? { ok: true, mensaje: `Publicación borrada${titulo ? `: «${titulo}»` : ""}.` } : falla(r);
    }
  }
}

/** Lo que se puede deshacer en los 6 s del aviso. Armar la novedad y tildar un envío, no (ya se mandó). */
export const DESHACIBLES_NOVEDADES: ReadonlySet<AccionNovedades["tipo"]> = new Set(["baja", "guardarPublicacion", "borrarPublicacion"]);
