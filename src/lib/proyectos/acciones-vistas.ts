"use server";

// ============================================================================
// VISTAS GUARDADAS — escrituras (MIA T03, O46). Cada persona guarda las suyas; las de un rol, sólo Dirección.
// Una vista personal es de quien la guardó: nadie más la lee ni la borra. Acotado al negocio de la sesión.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { esTablaInexistente } from "@/lib/rendiciones/pin-core";
import type { Prisma } from "@/generated/prisma/client";
import { actorActual } from "./gestion.server";
import { ROLES_GESTION } from "./gestion-core";
import { veLaLista } from "./vistas.server";
import { esLista, normalizarVista } from "./vistas-core";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

const RUTA = "/admin/proyectos/administracion";
const SIN_TABLA = "Las vistas todavía no se pueden guardar en este servidor: falta aplicar la actualización de la base.";
const txt = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

export async function guardarVista(formData: FormData): Promise<Resultado> {
  const a = await actorActual();
  const lista = txt(formData.get("lista"), 40);
  if (!esLista(lista) || !veLaLista(a, lista)) return { ok: false, error: "No tenés acceso a esta lista." };
  const nombre = txt(formData.get("nombre"), 60);
  if (!nombre) return { ok: false, error: "Poné un nombre a la vista." };
  const alcance = txt(formData.get("alcance"), 10) === "ROL" ? "ROL" : "PERSONA";
  const rol = txt(formData.get("rol"), 20);
  if (alcance === "ROL" && a.rol !== "DIRECCION") return { ok: false, error: "Sólo Dirección guarda vistas para un rol." };
  if (alcance === "ROL" && !(ROLES_GESTION as readonly string[]).includes(rol)) return { ok: false, error: "Elegí el rol." };
  const n = normalizarVista(lista, {
    columnas: formData.getAll("columnas").map(String),
    filtros: { estado: formData.get("estado"), origen: formData.get("origen"), moneda: formData.get("moneda"), venceEnDias: formData.get("venceEnDias") },
    agrupacion: txt(formData.get("agrupacion"), 20),
    orden: txt(formData.get("orden"), 20) || null,
  });
  if (!n.ok) return n;
  const propietario = alcance === "ROL" ? rol : a.user.id;
  const datos = { columnas: n.vista.columnas, filtros: n.vista.filtros as unknown as Prisma.InputJsonValue, agrupacion: n.vista.agrupacion || null, orden: n.vista.orden };
  try {
    const v = await tenantTransaction(
      (tx) =>
        tx.proyectoVista.upsert({
          where: { tenantId_lista_alcance_propietario_nombre: { tenantId: a.tenantId, lista, alcance, propietario, nombre } },
          create: { tenantId: a.tenantId, lista, nombre, alcance, propietario, creadaPor: a.user.id, ...datos },
          update: datos,
          select: { id: true },
        }),
      { tenantId: a.tenantId },
    );
    revalidatePath(RUTA);
    return { ok: true, id: v.id };
  } catch (e) {
    if (esTablaInexistente(e)) return { ok: false, error: SIN_TABLA };
    throw e;
  }
}

/** La personal, sólo su dueño; la de un rol, sólo Dirección. Lo de otro negocio ni se encuentra. */
export async function borrarVista(formData: FormData): Promise<Resultado> {
  const a = await actorActual();
  const id = txt(formData.get("id"), 40);
  try {
    const v = await prisma.proyectoVista.findFirst({ where: { id, tenantId: a.tenantId }, select: { alcance: true, propietario: true } });
    const puede = v && ((v.alcance === "PERSONA" && v.propietario === a.user.id) || (v.alcance === "ROL" && a.rol === "DIRECCION"));
    if (!puede) return { ok: false, error: "No podés borrar esa vista." };
    await tenantTransaction((tx) => tx.proyectoVista.deleteMany({ where: { id, tenantId: a.tenantId } }), { tenantId: a.tenantId });
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    if (esTablaInexistente(e)) return { ok: false, error: SIN_TABLA };
    throw e;
  }
}
