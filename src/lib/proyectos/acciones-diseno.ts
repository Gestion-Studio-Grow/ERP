"use server";

// ============================================================================
// DISEÑO, CHAT E IA — escrituras. Cada acción vuelve a pedir el permiso, acota por negocio y comprueba que la persona ve ese
// proyecto: esconder un botón no protege nada.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auditAdmin } from "@/lib/audit-core";
import type { Prisma } from "@/generated/prisma/client";
import { subirVersion, type Resultado } from "./acciones";
import { fechaCorta } from "./core";
import { datosDelNegocio } from "./datos.server";
import { accesoChat, personasDelChat } from "./diseno.server";
import {
  agenteBloqueado,
  armarLaminas,
  colorValido,
  esAgente,
  esMarcaDeRevision,
  esPlantilla,
  ETIQUETA_ESTUDIO,
  leerRef,
  linkSeguro,
  normalizarImagenes,
  normalizarMoodboards,
  puntoEnImagen,
  textoDeComentario,
  textoDeRevision,
  validarHistorial,
} from "./diseno-core";
import { actorActual, avisar, exigirEditar, proyectoVisible, puede } from "./gestion.server";
import { ESTADOS_TAREA, mencionados, veTodosLosProyectos, type RolGestion } from "./gestion-core";
import { charlarConAgente, generarImagen, iaConectada, proponerIdeaDelProyecto, proponerStandDelProyecto, FALTA_CLAVE, type IdeaPropuesta } from "./ia.server";

const RAIZ = "/admin/proyectos";
const MAX_ARCHIVOS = 30;
const MAX_IMAGEN = 1_400_000;
const MAX_ENTREGABLES = 60;
const MAX_COMENTARIOS = 300;
const MAX_IMAGENES_IDEA = 24;
const MAX_MOODBOARDS = 20;
const MAX_PRESENTACIONES = 30;

const SIN_PROYECTO = "Ese proyecto no existe o no está entre los tuyos.";
const imagenValida = (d: unknown): d is string => typeof d === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(d) && d.length <= MAX_IMAGEN;
const texto = (v: unknown, tope: number): string => (typeof v === "string" ? v.trim().slice(0, tope) : "");

function fecha(v: unknown): Date | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00-03:00`) : null;
}

function refrescar(proyectoId?: string | null) {
  revalidatePath(`${RAIZ}/diseno`);
  revalidatePath(`${RAIZ}/propuesta-ia`);
  if (proyectoId) revalidatePath(`${RAIZ}/${proyectoId}`);
}

// ── Tareas ──────────────────────────────────────────────────────────────────

export async function guardarTareaDiseno(d: { id?: string | null; titulo: string; proyectoId: string; personaId?: string | null; venceEl?: string | null; area?: string }): Promise<Resultado> {
  const a = await exigirEditar("diseno");
  const { tenantId } = a;
  const titulo = texto(d.titulo, 200);
  if (!titulo) return { ok: false, error: "Escribí el título de la tarea." };
  if (!(await proyectoVisible(a, d.proyectoId))) return { ok: false, error: SIN_PROYECTO };
  const area = d.area === "PRODUCCION" ? "PRODUCCION" : "DISENO";
  const previa = d.id ? await prisma.proyectoTarea.findFirst({ where: { id: d.id, tenantId }, select: { id: true, proyectoId: true, personaId: true } }) : null;
  if (d.id && (!previa || !(await proyectoVisible(a, previa.proyectoId)))) return { ok: false, error: "Esa tarea ya no existe." };
  const persona = d.personaId ? await prisma.proyectoPersona.findFirst({ where: { id: d.personaId, tenantId, activa: true }, select: { id: true, nombre: true, userId: true, rol: true } }) : null;
  if (d.personaId && !persona) return { ok: false, error: "Esa persona ya no está en el equipo." };
  if (persona && !veTodosLosProyectos(persona.rol as RolGestion)) {
    const enEquipo = await prisma.proyectoEquipo.findFirst({ where: { tenantId, proyectoId: d.proyectoId, personaId: persona.id }, select: { id: true } });
    if (!enEquipo) return { ok: false, error: `${persona.nombre} no está en el equipo de ese proyecto: no vería la tarea. Sumala desde el Resumen del proyecto.` };
  }
  const datos = { titulo, proyectoId: d.proyectoId, personaId: persona?.id ?? null, responsable: persona?.nombre ?? null, area, venceEl: fecha(d.venceEl) };
  if (previa) await prisma.proyectoTarea.updateMany({ where: { id: previa.id, tenantId }, data: datos });
  else await prisma.proyectoTarea.create({ data: { ...datos, tenantId } });
  if (persona?.userId && persona.userId !== a.user.id && persona.id !== previa?.personaId) {
    await avisar(prisma, { tenantId, destinatarios: [persona.userId], tipo: "tarea", texto: `${a.nombre} te asignó una tarea: ${titulo}`, enlace: `${RAIZ}/diseno` });
  }
  refrescar(d.proyectoId);
  return { ok: true };
}

export async function moverTareaDiseno(d: { id: string; estado: string }): Promise<Resultado> {
  const a = await exigirEditar("diseno");
  if (!(ESTADOS_TAREA as readonly string[]).includes(d.estado)) return { ok: false, error: "Ese estado no existe." };
  const t = await prisma.proyectoTarea.findFirst({ where: { id: d.id, tenantId: a.tenantId }, select: { proyectoId: true, hechaEl: true } });
  if (!t || !(await proyectoVisible(a, t.proyectoId))) return { ok: false, error: "Esa tarea ya no existe." };
  const hechaEl = d.estado === "APROBADA" ? (t.hechaEl ?? new Date()) : null;
  await prisma.proyectoTarea.updateMany({ where: { id: d.id, tenantId: a.tenantId }, data: { estado: d.estado, hechaEl } });
  refrescar(t.proyectoId);
  return { ok: true };
}

// ── Versiones y devoluciones ────────────────────────────────────────────────

/** Sube sobre una pieza o abre una nueva. Reemplazar un borrador cambia la imagen: los puntos ya no señalarían nada, así que pasan a comentarios generales. */
export async function subirVersionDiseno(d: { proyectoId: string; entregableId?: string | null; nombreNuevo?: string; datos?: string | null; url?: string | null; nota?: string }): Promise<Resultado<{ entregableId: string }>> {
  const a = await exigirEditar("diseno");
  const { tenantId } = a;
  if (!(await proyectoVisible(a, d.proyectoId))) return { ok: false, error: SIN_PROYECTO };
  let entregableId = d.entregableId ?? "";
  let creada = false;
  if (entregableId) {
    const e = await prisma.proyectoEntregable.findFirst({ where: { id: entregableId, tenantId, proyectoId: d.proyectoId, anuladoEl: null }, select: { id: true } });
    if (!e) return { ok: false, error: "Esa pieza ya no existe." };
  } else {
    const nombre = texto(d.nombreNuevo, 120);
    if (!nombre) return { ok: false, error: "Elegí una pieza o escribí el nombre de una nueva." };
    if ((await prisma.proyectoEntregable.count({ where: { tenantId, proyectoId: d.proyectoId, anuladoEl: null } })) >= MAX_ENTREGABLES) return { ok: false, error: `Un proyecto guarda hasta ${MAX_ENTREGABLES} piezas.` };
    entregableId = (await prisma.proyectoEntregable.create({ data: { tenantId, proyectoId: d.proyectoId, nombre }, select: { id: true } })).id;
    creada = true;
  }
  const borrador = creada ? null : await prisma.proyectoEntregableVersion.findFirst({ where: { tenantId, entregableId, estado: "BORRADOR" }, select: { id: true } });
  const r = await subirVersion({ entregableId, datos: d.datos, url: d.url, nota: d.nota });
  if (!r.ok) {
    // Una pieza recién abierta sin versión no le sirve a nadie.
    if (creada) await prisma.proyectoEntregable.deleteMany({ where: { id: entregableId, tenantId } });
    return r;
  }
  if (borrador) {
    const comentarios = await prisma.proyectoComentarioImagen.findMany({ where: { tenantId, versionId: borrador.id }, select: { id: true, texto: true } });
    const revisiones = comentarios.filter((c) => esMarcaDeRevision(c.texto)).map((c) => c.id);
    if (revisiones.length > 0) await prisma.proyectoComentarioImagen.deleteMany({ where: { tenantId, id: { in: revisiones } } });
    await prisma.proyectoComentarioImagen.updateMany({ where: { tenantId, versionId: borrador.id, x: { not: null } }, data: { x: null, y: null } });
  }
  refrescar(d.proyectoId);
  return { ok: true, entregableId };
}

async function versionDelActor(id: string) {
  const a = await exigirEditar("diseno");
  const v = await prisma.proyectoEntregableVersion.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true, numero: true, estado: true, entregable: { select: { proyectoId: true } } } });
  if (!v || !(await proyectoVisible(a, v.entregable.proyectoId))) return { a, v: null };
  return { a, v };
}

export async function comentarVersion(d: { versionId: string; texto: string; x?: number | null; y?: number | null }): Promise<Resultado> {
  const { a, v } = await versionDelActor(d.versionId);
  if (!v) return { ok: false, error: "Esa versión ya no existe." };
  const cuerpo = textoDeComentario(typeof d.texto === "string" ? d.texto : "");
  if (!cuerpo) return { ok: false, error: "Escribí el comentario." };
  if ((await prisma.proyectoComentarioImagen.count({ where: { tenantId: a.tenantId, versionId: v.id } })) >= MAX_COMENTARIOS) return { ok: false, error: "Esta versión ya tiene demasiados comentarios." };
  const conPunto = d.x != null || d.y != null;
  const punto = conPunto ? puntoEnImagen(d.x, d.y) : null;
  if (conPunto && !punto) return { ok: false, error: "Ese punto está fuera de la imagen." };
  await prisma.proyectoComentarioImagen.create({ data: { tenantId: a.tenantId, versionId: v.id, x: punto?.x ?? null, y: punto?.y ?? null, autor: a.nombre, texto: cuerpo } });
  revalidatePath(`${RAIZ}/diseno/version/${v.id}`);
  refrescar(v.entregable.proyectoId);
  return { ok: true };
}

export async function resolverComentario(d: { id: string; resuelto: boolean }): Promise<Resultado> {
  const a = await exigirEditar("diseno");
  const c = await prisma.proyectoComentarioImagen.findFirst({ where: { id: d.id, tenantId: a.tenantId }, select: { versionId: true, version: { select: { entregable: { select: { proyectoId: true } } } } } });
  if (!c || !(await proyectoVisible(a, c.version.entregable.proyectoId))) return { ok: false, error: "Ese comentario ya no existe." };
  await prisma.proyectoComentarioImagen.updateMany({ where: { id: d.id, tenantId: a.tenantId }, data: { resueltoEl: d.resuelto ? new Date() : null } });
  revalidatePath(`${RAIZ}/diseno/version/${c.versionId}`);
  return { ok: true };
}

/** Aprobar o pedir cambios dentro del equipo. No toca el estado de la versión: ése es el del circuito con el cliente. */
export async function revisarVersion(d: { versionId: string; tipo: "APROBADA" | "CAMBIOS"; nota?: string }): Promise<Resultado> {
  const { a, v } = await versionDelActor(d.versionId);
  if (!v) return { ok: false, error: "Esa versión ya no existe." };
  const tipo = d.tipo === "APROBADA" ? "APROBADA" : "CAMBIOS";
  const nota = texto(d.nota, 1000);
  if (tipo === "CAMBIOS" && !nota) return { ok: false, error: "Contá qué hay que cambiar." };
  await prisma.proyectoComentarioImagen.create({ data: { tenantId: a.tenantId, versionId: v.id, autor: a.nombre, texto: textoDeRevision(tipo, nota) } });
  await auditAdmin({ action: "proyecto.version.revision", entity: "ProyectoEntregableVersion", entityId: v.id, changes: { tipo, numero: v.numero } });
  revalidatePath(`${RAIZ}/diseno/version/${v.id}`);
  refrescar(v.entregable.proyectoId);
  return { ok: true };
}

// ── Idea ────────────────────────────────────────────────────────────────────

export async function guardarIdea(d: { proyectoId: string; concepto: string; narrativa: string; referencias: string; materialidades: string; informacion: string }): Promise<Resultado> {
  const a = await exigirEditar("diseno");
  if (!(await proyectoVisible(a, d.proyectoId))) return { ok: false, error: SIN_PROYECTO };
  const datos = {
    concepto: texto(d.concepto, 8000),
    narrativa: texto(d.narrativa, 8000),
    referencias: texto(d.referencias, 8000),
    materialidades: texto(d.materialidades, 8000),
    informacion: texto(d.informacion, 8000),
  };
  await prisma.proyectoIdea.upsert({ where: { proyectoId: d.proyectoId }, create: { tenantId: a.tenantId, proyectoId: d.proyectoId, ...datos }, update: datos });
  refrescar(d.proyectoId);
  return { ok: true };
}

/** Sólo propone: el texto vuelve al formulario y guardarlo lo decide la persona. */
export async function proponerIdea(d: { proyectoId: string; pedido?: string }): Promise<Resultado<{ idea: IdeaPropuesta }>> {
  const a = await exigirEditar("diseno");
  if (!puede(a, "ia", "editar")) return { ok: false, error: "Tu rol no puede usar la IA." };
  if (!iaConectada()) return { ok: false, error: FALTA_CLAVE };
  if (!(await proyectoVisible(a, d.proyectoId))) return { ok: false, error: SIN_PROYECTO };
  const r = await proponerIdeaDelProyecto(a, d.proyectoId, texto(d.pedido, 2000));
  return r.ok ? { ok: true, idea: r.idea } : r;
}

/** Crea una opción NUEVA de stand con el borrador del agente. No toca las opciones que ya hay: la persona lo abre, lo ajusta y lo guarda. */
export async function armarStandConIA(d: { proyectoId: string; pedido?: string }): Promise<Resultado<{ id: string; notas: string }>> {
  const a = await exigirEditar("diseno");
  if (!puede(a, "ia", "editar")) return { ok: false, error: "Tu rol no puede usar la IA." };
  if (!iaConectada()) return { ok: false, error: FALTA_CLAVE };
  if (!(await proyectoVisible(a, d.proyectoId))) return { ok: false, error: SIN_PROYECTO };
  const r = await proponerStandDelProyecto(a, d.proyectoId, texto(d.pedido, 2000));
  if (!r.ok) return r;
  const cuantos = await prisma.proyectoStand.count({ where: { tenantId: a.tenantId, proyectoId: d.proyectoId } });
  const s = await prisma.proyectoStand.create({
    data: { tenantId: a.tenantId, proyectoId: d.proyectoId, nombre: `Opción ${cuantos + 1} · borrador de IA`, diseno: r.diseno as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  refrescar(d.proyectoId);
  return { ok: true, id: s.id, notas: r.notas };
}

async function ideaEditable(proyectoId: string) {
  const a = await exigirEditar("diseno");
  if (!(await proyectoVisible(a, proyectoId))) return null;
  const idea = await prisma.proyectoIdea.findFirst({ where: { tenantId: a.tenantId, proyectoId }, select: { imagenes: true, moodboards: true } });
  return { a, imagenes: normalizarImagenes(idea?.imagenes), moodboards: normalizarMoodboards(idea?.moodboards) };
}

/** La imagen tiene que ser de este proyecto: una referencia no abre la imagen de otro. */
async function imagenDelProyecto(tenantId: string, proyectoId: string, ref: string): Promise<boolean> {
  const r = leerRef(ref);
  if (!r) return false;
  if (r.tipo === "url") return true;
  if (r.tipo === "archivo") return !!(await prisma.proyectoArchivo.findFirst({ where: { id: r.id, tenantId, proyectoId, datos: { startsWith: "data:image/" } }, select: { id: true } }));
  return !!(await prisma.proyectoEntregableVersion.findFirst({ where: { id: r.id, tenantId, entregable: { proyectoId }, datos: { not: null } }, select: { id: true } }));
}

export async function alternarImagenIdea(d: { proyectoId: string; ref: string }): Promise<Resultado> {
  const i = await ideaEditable(d.proyectoId);
  if (!i) return { ok: false, error: SIN_PROYECTO };
  const { a, imagenes } = i;
  const ya = imagenes.includes(d.ref);
  if (!ya && !(await imagenDelProyecto(a.tenantId, d.proyectoId, d.ref))) return { ok: false, error: "Esa imagen no es de este proyecto." };
  if (!ya && imagenes.length >= MAX_IMAGENES_IDEA) return { ok: false, error: `La idea guarda hasta ${MAX_IMAGENES_IDEA} imágenes elegidas.` };
  const nuevas = (ya ? imagenes.filter((x) => x !== d.ref) : [...imagenes, d.ref]) as unknown as Prisma.InputJsonValue;
  await prisma.proyectoIdea.upsert({ where: { proyectoId: d.proyectoId }, create: { tenantId: a.tenantId, proyectoId: d.proyectoId, imagenes: nuevas }, update: { imagenes: nuevas } });
  refrescar(d.proyectoId);
  return { ok: true };
}

export async function agregarMoodboard(d: { proyectoId: string; nombre: string; link: string }): Promise<Resultado> {
  const i = await ideaEditable(d.proyectoId);
  if (!i) return { ok: false, error: SIN_PROYECTO };
  const link = linkSeguro(d.link);
  if (!link) return { ok: false, error: "Pegá un link que empiece con https://." };
  if (i.moodboards.length >= MAX_MOODBOARDS) return { ok: false, error: `La idea guarda hasta ${MAX_MOODBOARDS} moodboards.` };
  const nuevos = [...i.moodboards, { nombre: texto(d.nombre, 120) || link, link }] as unknown as Prisma.InputJsonValue;
  await prisma.proyectoIdea.upsert({ where: { proyectoId: d.proyectoId }, create: { tenantId: i.a.tenantId, proyectoId: d.proyectoId, moodboards: nuevos }, update: { moodboards: nuevos } });
  refrescar(d.proyectoId);
  return { ok: true };
}

export async function quitarMoodboard(d: { proyectoId: string; link: string }): Promise<Resultado> {
  const i = await ideaEditable(d.proyectoId);
  if (!i) return { ok: false, error: SIN_PROYECTO };
  const nuevos = i.moodboards.filter((m) => m.link !== d.link) as unknown as Prisma.InputJsonValue;
  await prisma.proyectoIdea.update({ where: { proyectoId: d.proyectoId }, data: { moodboards: nuevos } }).catch(() => null);
  refrescar(d.proyectoId);
  return { ok: true };
}

// ── Estudio ─────────────────────────────────────────────────────────────────

async function guardarDelEstudio(a: Awaited<ReturnType<typeof exigirEditar>>, proyectoId: string, nombre: string, datos: string): Promise<Resultado<{ ref: string }>> {
  if ((await prisma.proyectoArchivo.count({ where: { tenantId: a.tenantId, proyectoId, clave: null } })) >= MAX_ARCHIVOS) return { ok: false, error: `Un proyecto guarda hasta ${MAX_ARCHIVOS} archivos. Sacá alguno que ya no uses.` };
  const creado = await prisma.proyectoArchivo.create({ data: { tenantId: a.tenantId, proyectoId, tipo: "RENDER", nombre: `${ETIQUETA_ESTUDIO}${nombre}`.slice(0, 120), datos, subidoPor: a.nombre }, select: { id: true } });
  refrescar(proyectoId);
  return { ok: true, ref: `archivo:${creado.id}` };
}

export async function generarEnEstudio(d: { proyectoId: string; pedido: string }): Promise<Resultado<{ ref: string }>> {
  const a = await exigirEditar("ia");
  if (!puede(a, "diseno", "editar")) return { ok: false, error: "Tu rol no puede guardar imágenes en el proyecto." };
  if (!(await proyectoVisible(a, d.proyectoId))) return { ok: false, error: SIN_PROYECTO };
  const pedido = texto(d.pedido, 2000);
  if (!pedido) return { ok: false, error: "Escribí qué imagen querés." };
  const r = await generarImagen(pedido);
  if (!r.ok) return r;
  return guardarDelEstudio(a, d.proyectoId, pedido, r.datos);
}

/** Sin servicio de imágenes conectado, el resto del camino funciona igual con una imagen subida a mano. */
export async function subirAlEstudio(d: { proyectoId: string; nombre: string; datos: string }): Promise<Resultado<{ ref: string }>> {
  const a = await exigirEditar("diseno");
  if (!(await proyectoVisible(a, d.proyectoId))) return { ok: false, error: SIN_PROYECTO };
  if (!imagenValida(d.datos)) return { ok: false, error: "La imagen es demasiado pesada o no es válida." };
  return guardarDelEstudio(a, d.proyectoId, texto(d.nombre, 100) || "Imagen subida a mano", d.datos);
}

// ── Presentaciones ──────────────────────────────────────────────────────────

/** Con reglas, sin IA: sale de la idea, las imágenes elegidas y el brief. Funciona sin clave. */
export async function generarPresentacion(d: { proyectoId: string; plantilla: string; fondo?: string; acento?: string }): Promise<Resultado<{ id: string }>> {
  const a = await exigirEditar("diseno");
  const { tenantId } = a;
  if (!esPlantilla(d.plantilla)) return { ok: false, error: "Elegí una plantilla." };
  if (d.plantilla === "CLIENTE" && !(colorValido(d.fondo) && colorValido(d.acento))) return { ok: false, error: "Elegí los dos colores del cliente." };
  if (!(await proyectoVisible(a, d.proyectoId))) return { ok: false, error: SIN_PROYECTO };
  const p = await prisma.proyecto.findFirst({
    where: { id: d.proyectoId, tenantId },
    select: { nombre: true, brief: true, tipoEvento: true, evento: true, lugar: true, ciudad: true, fechaEvento: true, invitados: true, client: { select: { name: true } }, idea: { select: { concepto: true, narrativa: true, referencias: true, materialidades: true, imagenes: true } } },
  });
  if (!p) return { ok: false, error: SIN_PROYECTO };
  const negocio = await datosDelNegocio(tenantId);
  const elegidas = normalizarImagenes(p.idea?.imagenes);
  const siguen = await Promise.all(elegidas.map((r) => imagenDelProyecto(tenantId, d.proyectoId, r)));
  const laminas = armarLaminas(
    {
      nombre: p.nombre,
      cliente: p.client.name,
      negocio: negocio.nombre,
      tipoEvento: p.tipoEvento ?? p.evento,
      lugar: [p.lugar, p.ciudad].filter(Boolean).join(", ") || null,
      fecha: p.fechaEvento ? fechaCorta(p.fechaEvento) : null,
      invitados: p.invitados,
      brief: p.brief,
      concepto: p.idea?.concepto ?? "",
      narrativa: p.idea?.narrativa ?? "",
      materialidades: p.idea?.materialidades ?? "",
      referencias: p.idea?.referencias ?? "",
      imagenes: elegidas.filter((_, i) => siguen[i]),
    },
    d.plantilla === "CLIENTE" ? { fondo: d.fondo as string, acento: d.acento as string } : null,
  );
  if (laminas.length === 0) return { ok: false, error: "Falta contenido: cargá el concepto de la idea o el brief del proyecto." };
  const cuantas = await prisma.proyectoPresentacion.count({ where: { tenantId, proyectoId: d.proyectoId } });
  if (cuantas >= MAX_PRESENTACIONES) return { ok: false, error: `Un proyecto guarda hasta ${MAX_PRESENTACIONES} presentaciones.` };
  const creada = await prisma.proyectoPresentacion.create({
    data: { tenantId, proyectoId: d.proyectoId, nombre: `${p.nombre} · versión ${cuantas + 1}`, plantilla: d.plantilla, laminas: laminas as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  refrescar(d.proyectoId);
  return { ok: true, id: creada.id };
}

async function presentacionDelActor(id: string) {
  const a = await exigirEditar("diseno");
  const pr = await prisma.proyectoPresentacion.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true, proyectoId: true, estado: true } });
  if (!pr || !(await proyectoVisible(a, pr.proyectoId))) return { a, pr: null };
  return { a, pr };
}

export async function enviarPresentacion(d: { id: string }): Promise<Resultado> {
  const { a, pr } = await presentacionDelActor(d.id);
  if (!pr) return { ok: false, error: "Esa presentación ya no existe." };
  const r = await prisma.proyectoPresentacion.updateMany({ where: { id: pr.id, tenantId: a.tenantId, estado: "BORRADOR" }, data: { estado: "ENVIADA" } });
  if (r.count === 0) return { ok: false, error: "Esa presentación ya se envió." };
  await auditAdmin({ action: "proyecto.presentacion.enviar", entity: "ProyectoPresentacion", entityId: pr.id, changes: {} });
  refrescar(pr.proyectoId);
  return { ok: true };
}

/** Lo que el cliente dijo por fuera del portal (una llamada, un mail) también queda escrito. */
export async function registrarRespuestaPresentacion(d: { id: string; aprueba: boolean; respuesta?: string }): Promise<Resultado> {
  const { a, pr } = await presentacionDelActor(d.id);
  if (!pr) return { ok: false, error: "Esa presentación ya no existe." };
  if (pr.estado === "BORRADOR") return { ok: false, error: "Primero hay que enviarla." };
  const respuesta = texto(d.respuesta, 2000);
  if (!d.aprueba && !respuesta) return { ok: false, error: "Contá qué cambios pidió el cliente." };
  await prisma.proyectoPresentacion.updateMany({ where: { id: pr.id, tenantId: a.tenantId }, data: { estado: d.aprueba ? "APROBADA" : "CAMBIOS", respuesta: respuesta || null } });
  await auditAdmin({ action: "proyecto.presentacion.respuesta", entity: "ProyectoPresentacion", entityId: pr.id, changes: { aprueba: d.aprueba, registradaPor: a.nombre } });
  refrescar(pr.proyectoId);
  return { ok: true };
}

// ── Chat ────────────────────────────────────────────────────────────────────

export async function enviarMensajeChat(d: { proyectoId: string | null; canal: string; texto: string; adjuntoNombre?: string; adjuntoUrl?: string; archivoId?: string }): Promise<Resultado> {
  const a = await actorActual();
  const proyectoId = d.proyectoId || null;
  const acceso = await accesoChat(a, proyectoId);
  if (!acceso.escribir) throw new Error("No tenés permiso para hacer esto.");
  if (!acceso.canales.includes(d.canal)) return { ok: false, error: "Elegí un canal para escribir." };
  const cuerpo = texto(d.texto, 4000);
  const crudo = texto(d.adjuntoUrl, 2000);
  const archivoId = String(d.archivoId ?? "");
  const archivo = archivoId && proyectoId ? await prisma.proyectoArchivo.findFirst({ where: { id: archivoId, tenantId: a.tenantId, proyectoId, OR: [{ datos: { not: null } }, { clave: { not: null } }] }, select: { id: true, nombre: true } }) : null;
  if (archivoId && !archivo) return { ok: false, error: "Ese archivo ya no está en el proyecto." };
  const adjuntoUrl = archivo ? `/admin/proyectos/${proyectoId}/archivo/${archivo.id}` : crudo ? linkSeguro(crudo) : null;
  if (crudo && !adjuntoUrl) return { ok: false, error: "El adjunto tiene que ser un link que empiece con https://." };
  if (!cuerpo && !adjuntoUrl) return { ok: false, error: "Escribí un mensaje." };
  await prisma.proyectoMensaje.create({
    data: { tenantId: a.tenantId, proyectoId, canal: d.canal, autor: a.nombre, texto: cuerpo, adjuntoUrl, adjuntoNombre: archivo?.nombre ?? (adjuntoUrl ? texto(d.adjuntoNombre, 120) || "Adjunto" : null) },
  });
  const personas = await personasDelChat(a, proyectoId, d.canal);
  const nombrados = new Set(mencionados(cuerpo, personas));
  const destinatarios = personas.filter((p) => nombrados.has(p.id) && p.userId && p.userId !== a.user.id).map((p) => p.userId as string);
  if (destinatarios.length > 0) {
    const nombre = proyectoId ? (await prisma.proyecto.findFirst({ where: { id: proyectoId, tenantId: a.tenantId }, select: { nombre: true } }))?.nombre : null;
    await avisar(prisma, {
      tenantId: a.tenantId,
      destinatarios,
      tipo: "mencion",
      texto: `${a.nombre} te mencionó en el chat de ${nombre ?? "Diseño"}`,
      enlace: proyectoId ? `${RAIZ}/${proyectoId}?tab=chat` : `${RAIZ}/diseno?tab=chat`,
    });
  }
  if (proyectoId) revalidatePath(`${RAIZ}/${proyectoId}`);
  else revalidatePath(`${RAIZ}/diseno`);
  return { ok: true };
}

// ── Agentes ─────────────────────────────────────────────────────────────────

/**
 * Leer con un agente no escribe nada, así que alcanza con poder ver la IA: si pidiera editar, Administración (que de fábrica
 * ve pero no edita la IA) tendría a su propio agente siempre bloqueado. Lo que el agente lee lo recorta contextoDeAgente.
 */
export async function conversarConAgente(d: { agente: string; proyectoId?: string | null; mensajes: unknown }): Promise<Resultado<{ texto: string; cortada: boolean }>> {
  const a = await actorActual();
  if (!puede(a, "ia", "ver")) throw new Error("No tenés permiso para hacer esto.");
  if (!esAgente(d.agente) || agenteBloqueado(d.agente, (m) => puede(a, m, "ver"))) return { ok: false, error: "Tu rol no tiene acceso a este agente." };
  if (!iaConectada()) return { ok: false, error: FALTA_CLAVE };
  const proyectoId = d.proyectoId || null;
  if (proyectoId && !(await proyectoVisible(a, proyectoId))) return { ok: false, error: SIN_PROYECTO };
  const mensajes = validarHistorial(d.mensajes);
  if (!mensajes) return { ok: false, error: "La charla es demasiado larga. Empezá una nueva." };
  const r = await charlarConAgente(a, d.agente, proyectoId, mensajes);
  return r.ok ? { ok: true, texto: r.texto, cortada: r.cortada } : r;
}
