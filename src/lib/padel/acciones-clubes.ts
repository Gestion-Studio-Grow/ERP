"use server";

// ============================================================================
// PADEL-CLASES — E4 · Clubes (Ajustes → Clubes). Alta, editar nombre/dirección/link de Maps y
// desactivar (o volver a activar). NUNCA se borra: las clases y franjas viejas siguen diciendo en qué
// club fueron. Como el resto de Ajustes: `agenda:manage`, todo por `tenantId`, rastro en auditoría.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapabilityFueraDeLaAgenda } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import { linkDeMapsValido, nombreDeClub } from "./core";
import { refrescar, type Resultado } from "./acciones-compartido";

/** Tope de clubes por profe: más que esto es un dedo que se quedó apretado. */
const MAX_CLUBES = 30;

function leerClub(fd: FormData): { ok: true; nombre: string; direccion: string | null; mapsUrl: string | null } | { ok: false; error: string } {
  const nombre = nombreDeClub(fd.get("nombre"));
  if (!nombre) return { ok: false, error: "Poné el nombre del club (de 2 a 60 letras)." };
  const direccion = String(fd.get("direccion") ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || null;
  const maps = linkDeMapsValido(fd.get("mapsUrl"));
  if (!maps.ok) return { ok: false, error: "El link de Maps tiene que empezar con https://. Copialo de Google Maps → Compartir." };
  return { ok: true, nombre, direccion, mapsUrl: maps.url };
}

const esNombreRepetido = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export async function crearClub(fd: FormData): Promise<Resultado<{ id: string }>> {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const v = leerClub(fd);
  if (!v.ok) return v;
  const cuantos = await prisma.padelClub.count({ where: { tenantId } });
  if (cuantos >= MAX_CLUBES) return { ok: false, error: `Como mucho ${MAX_CLUBES} clubes.` };
  try {
    const c = await prisma.padelClub.create({ data: { tenantId, nombre: v.nombre, direccion: v.direccion, mapsUrl: v.mapsUrl, orden: cuantos }, select: { id: true } });
    await auditAdmin({ action: "padel.club.crear", entity: "PadelClub", entityId: c.id, changes: { nombre: v.nombre } });
    refrescar();
    return { ok: true, id: c.id };
  } catch (e) {
    if (esNombreRepetido(e)) return { ok: false, error: "Ya tenés un club con ese nombre." };
    throw e;
  }
}

export async function editarClub(fd: FormData): Promise<Resultado> {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(fd.get("id") ?? "");
  const v = leerClub(fd);
  if (!v.ok) return v;
  try {
    const n = await prisma.padelClub.updateMany({ where: { tenantId, id }, data: { nombre: v.nombre, direccion: v.direccion, mapsUrl: v.mapsUrl } });
    if (n.count === 0) return { ok: false, error: "No encontramos ese club. Actualizá la pantalla." };
  } catch (e) {
    if (esNombreRepetido(e)) return { ok: false, error: "Ya tenés un club con ese nombre." };
    throw e;
  }
  await auditAdmin({ action: "padel.club.editar", entity: "PadelClub", entityId: id, changes: { nombre: v.nombre } });
  refrescar();
  return { ok: true };
}

/**
 * Desactivar (o volver a activar). Un club desactivado no se ofrece para agendar ni para las franjas
 * nuevas; lo que ya estaba en ese club lo sigue mostrando.
 */
export async function activarClub(id: string, activo: boolean): Promise<Resultado> {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const n = await prisma.padelClub.updateMany({ where: { tenantId, id: String(id ?? "") }, data: { activo: Boolean(activo) } });
  if (n.count === 0) return { ok: false, error: "No encontramos ese club. Actualizá la pantalla." };
  await auditAdmin({ action: activo ? "padel.club.activar" : "padel.club.desactivar", entity: "PadelClub", entityId: id });
  refrescar();
  return { ok: true };
}
