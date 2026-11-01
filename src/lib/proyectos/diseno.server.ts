// DISEÑO — lecturas compartidas por pantallas y acciones: quién entra a qué chat y a quién se puede asignar o mencionar.

import "server-only";
import { prisma } from "@/lib/prisma";
import { CANALES_CHAT, permisoDe, veTodosLosProyectos, type ModuloGestion, type RolGestion } from "./gestion-core";
import { proyectoVisible, puede, type Actor } from "./gestion.server";

const ESCRIBEN_EN_PROYECTO: readonly ModuloGestion[] = ["pipeline", "ficha", "diseno", "cotizaciones", "pagos"];

export interface AccesoChat {
  ver: boolean;
  escribir: boolean;
  canales: string[];
}

/**
 * El chat de un proyecto es de quien ve el proyecto. El canal de pagos, sólo de quien ve pagos: lo que se conversa ahí es plata.
 * El chat sin proyecto es el del equipo de diseño.
 */
export async function accesoChat(a: Actor, proyectoId: string | null): Promise<AccesoChat> {
  if (!proyectoId) return { ver: puede(a, "diseno", "ver"), escribir: puede(a, "diseno", "editar"), canales: ["general"] };
  const visible = puede(a, "pipeline", "ver") && !!(await proyectoVisible(a, proyectoId));
  if (!visible) return { ver: false, escribir: false, canales: [] };
  return {
    ver: true,
    escribir: ESCRIBEN_EN_PROYECTO.some((m) => puede(a, m, "editar")),
    canales: CANALES_CHAT.filter((c) => c !== "pagos" || puede(a, "pagos", "ver")),
  };
}

/** Los que pueden leer ese chat: a nadie se lo avisa de algo que no va a poder abrir. */
export async function personasDelChat(a: Actor, proyectoId: string | null, canal: string) {
  const [personas, equipo] = await Promise.all([
    prisma.proyectoPersona.findMany({ where: { tenantId: a.tenantId, activa: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, userId: true, rol: true } }),
    proyectoId ? prisma.proyectoEquipo.findMany({ where: { tenantId: a.tenantId, proyectoId }, select: { personaId: true } }) : Promise.resolve([]),
  ]);
  const delEquipo = new Set(equipo.map((e) => e.personaId));
  return personas.filter((p) => {
    const rol = p.rol as RolGestion;
    if (!proyectoId) return permisoDe(rol, "diseno", a.permisos).ver;
    if (!veTodosLosProyectos(rol) && !delEquipo.has(p.id)) return false;
    return canal !== "pagos" || permisoDe(rol, "pagos", a.permisos).ver;
  });
}

/** A quién se le puede asignar una tarea de cada proyecto: si no ve el proyecto, no vería su tarea. */
export async function personasAsignables(tenantId: string) {
  const [personas, equipos] = await Promise.all([
    prisma.proyectoPersona.findMany({ where: { tenantId, activa: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, rol: true } }),
    prisma.proyectoEquipo.findMany({ where: { tenantId }, select: { proyectoId: true, personaId: true } }),
  ]);
  const equipoPorProyecto: Record<string, string[]> = {};
  for (const e of equipos) (equipoPorProyecto[e.proyectoId] ??= []).push(e.personaId);
  return { personas: personas.map((p) => ({ id: p.id, nombre: p.nombre, veTodo: veTodosLosProyectos(p.rol as RolGestion) })), equipoPorProyecto };
}
