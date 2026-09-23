"use server";

// PROVEEDORES — alta, edición y baja lógica sobre `Supplier`.
//
// "use server" publica cada export como endpoint: ninguno recibe el negocio por parámetro (se
// resuelve del request) y todos pasan por `requireAppAccion("proveedores")`, que aplica la
// misma regla que el menú y la página (rol con `purchasing:manage`, módulo, rubro). El id del
// proveedor que llega del formulario sólo se usa junto con el `tenantId` del request (el repo
// scopea cada escritura por los dos): un id de otro negocio no encuentra nada.

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion } from "@/lib/require-app";
import { createSupplier, setSupplierActive, updateSupplier } from "@/lib/suppliers/supplier-repo";
import type { SupplierInput } from "@/lib/suppliers/supplier";

export type EstadoProveedor = null | { ok: true; mensaje: string } | { ok: false; error: string };

function datosDelFormulario(fd: FormData): SupplierInput {
  const txt = (k: string) => String(fd.get(k) ?? "");
  return { name: txt("name"), taxId: txt("taxId"), email: txt("email"), phone: txt("phone"), notes: txt("notes") };
}

function comoError(err: unknown): { ok: false; error: string } {
  // La sesión vencida llega como un redirect de Next: se deja pasar.
  unstable_rethrow(err);
  return { ok: false, error: err instanceof Error && err.message ? err.message : "No se pudo guardar. Probá de nuevo." };
}

/** Alta. Si sale bien, lleva a la ficha del proveedor nuevo. */
export async function crearProveedor(_prev: EstadoProveedor, fd: FormData): Promise<EstadoProveedor> {
  let id: string;
  try {
    await requireAppAccion("proveedores");
    const tenantId = await getCurrentTenantId();
    const creado = await createSupplier(tenantId, datosDelFormulario(fd));
    id = creado.id;
    await auditAdmin({ action: "create", entity: "Supplier", entityId: id, changes: { name: creado.name } });
    revalidatePath("/admin/proveedores");
    revalidatePath("/admin/compras");
  } catch (err) {
    return comoError(err);
  }
  redirect(`/admin/proveedores/${encodeURIComponent(id)}?alta=1`);
}

/** Edición de los datos de la ficha. */
export async function editarProveedor(_prev: EstadoProveedor, fd: FormData): Promise<EstadoProveedor> {
  try {
    await requireAppAccion("proveedores");
    const tenantId = await getCurrentTenantId();
    const id = String(fd.get("id") ?? "").trim();
    if (!id) return { ok: false, error: "Falta el proveedor. Volvé a abrir su ficha." };
    const datos = datosDelFormulario(fd);
    await updateSupplier(tenantId, id, datos);
    await auditAdmin({ action: "update", entity: "Supplier", entityId: id, changes: { name: datos.name, taxId: datos.taxId } });
    revalidatePath("/admin/proveedores");
    revalidatePath(`/admin/proveedores/${id}`);
    revalidatePath("/admin/compras");
    return { ok: true, mensaje: "Datos guardados." };
  } catch (err) {
    return comoError(err);
  }
}

/** Baja lógica (o reactivación). El historial queda: sólo deja de ofrecerse para elegir. */
export async function cambiarEstadoProveedor(_prev: EstadoProveedor, fd: FormData): Promise<EstadoProveedor> {
  try {
    await requireAppAccion("proveedores");
    const tenantId = await getCurrentTenantId();
    const id = String(fd.get("id") ?? "").trim();
    const activo = String(fd.get("activo") ?? "") === "1";
    if (!id || !(await setSupplierActive(tenantId, id, activo))) {
      return { ok: false, error: "Ese proveedor no es de este negocio o ya no existe." };
    }
    await auditAdmin({ action: activo ? "reactivate" : "deactivate", entity: "Supplier", entityId: id });
    revalidatePath("/admin/proveedores");
    revalidatePath(`/admin/proveedores/${id}`);
    revalidatePath("/admin/compras");
    return {
      ok: true,
      mensaje: activo
        ? "Proveedor reactivado: vuelve a aparecer para elegir al recibir mercadería."
        : "Proveedor dado de baja: ya no aparece para elegir. Sus compras y devoluciones quedan en su ficha.",
    };
  } catch (err) {
    return comoError(err);
  }
}
