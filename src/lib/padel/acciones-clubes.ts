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
import { isTableMissing } from "@/lib/prisma-errors";
import { tenantTransaction } from "@/lib/rls";
import { linkDeMapsValido, nombreDeClub } from "./core";
import { precioClubValido } from "./paquetes-core";
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

/**
 * T5 · Precio propio del club (individual y grupal por persona). Vacío = el de la lista general
 * (Ajustes → Precios). Los dos vacíos borran el precio propio. Rige para lo que se agende o se
 * confirme desde ahora: lo ya confirmado conserva su precio. Sin la migración 20261110120000
 * aplicada, contesta «todavía no está habilitado».
 */
export async function guardarPrecioClub(clubId: string, datos: { precioIndividual: unknown; precioGrupal: unknown }): Promise<Resultado> {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(clubId ?? "");
  const v = precioClubValido(datos ?? { precioIndividual: "", precioGrupal: "" });
  if (!v.ok) return v;
  try {
    const hecho = await tenantTransaction(async (tx) => {
      const club = await tx.padelClub.findFirst({ where: { tenantId, id }, select: { id: true } });
      if (!club) return false;
      if (v.precioIndividual === null && v.precioGrupal === null) {
        await tx.padelPrecioClub.deleteMany({ where: { tenantId, clubId: club.id } });
      } else {
        const data = { precioIndividual: v.precioIndividual, precioGrupal: v.precioGrupal };
        const n = await tx.padelPrecioClub.updateMany({ where: { tenantId, clubId: club.id }, data });
        if (n.count === 0) await tx.padelPrecioClub.create({ data: { tenantId, clubId: club.id, ...data } });
      }
      return true;
    }, { tenantId });
    if (!hecho) return { ok: false, error: "No encontramos ese club. Actualizá la pantalla." };
  } catch (e) {
    if (isTableMissing(e)) return { ok: false, error: "El precio por club todavía no está habilitado en tu cuenta." };
    // Dos guardados a la vez del mismo club: el segundo choca con el único de clubId.
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") return { ok: false, error: "Se guardó recién desde otro lado. Actualizá la pantalla." };
    throw e;
  }
  await auditAdmin({ action: "padel.club.precio", entity: "PadelClub", entityId: id, changes: { precioIndividual: v.precioIndividual, precioGrupal: v.precioGrupal } });
  refrescar();
  return { ok: true };
}
