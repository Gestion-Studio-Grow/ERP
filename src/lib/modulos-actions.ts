"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { derivarProducto, productoUsaTienda, type Producto } from "@/lib/producto-identidad";
import {
  catalogo,
  moduleRegistryEnabled,
  vistaModulos,
  planActivar,
  planDesactivar,
  type FilaModulo,
} from "@/modules";

// La "vidriera de módulos" del backoffice (/admin/modulos): el OWNER prende/apaga las
// apps de su propio negocio. Es la cáscara fina sobre la fundación de módulos
// (src/modules): resuelve el tenant + persiste `Tenant.modules[]`; toda la lógica de
// variante/dependencias (ADR-055 / DX-6) vive PURA en src/modules/vista.ts.
//
// El `Tenant` está FUERA de RLS a propósito (raíz del aislamiento, sin tenantId, ver
// prisma/rls/0001_enable_rls.sql §41): el scope correcto es `where: { id: tenantId }`
// con el tenantId que resuelve la request — nunca se nombra otra fila que la propia.

const MODULOS_PATH = "/admin/modulos";

/** Vuelve a la pantalla con feedback (banner). El detalle del error va URL-encoded. */
function backWith(status: string, detalle?: string): never {
  const q = new URLSearchParams({ status });
  if (detalle) q.set("msg", detalle);
  redirect(`${MODULOS_PATH}?${q.toString()}`);
}

export interface ModulosAdminData {
  filas: FilaModulo[];
  /** Rubro del tenant (blueprintId) — determina qué módulos aplican (variante). */
  rubro: string | null;
  /** Producto derivado del tenant (comerciante/contador/facturita/vertical) — decide la piel de la tienda. */
  producto: Producto;
  /**
   * ¿La fundación de módulos está ENFORCED por flag (MODULE_REGISTRY_ENABLED)? Si es
   * false, los cambios se guardan igual (la asignación es real), pero el gating del
   * producto por módulo todavía no la toma como autoritativa — se avisa en la UI.
   */
  enforced: boolean;
}

/** Loader de la pantalla: la vidriera de módulos del tenant actual. Solo OWNER. */
export async function getModulosForAdmin(): Promise<ModulosAdminData> {
  await requireCapability("modules:manage");
  const tenantId = await getCurrentTenantId();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { blueprintId: true, modules: true },
  });

  const state = {
    tenantId,
    blueprintId: tenant?.blueprintId ?? null,
    modules: tenant?.modules ?? [],
  };
  const producto = derivarProducto({ blueprintId: state.blueprintId, modules: state.modules });

  return {
    // Para productos de facturación (con tienda) la vista trae la metadata de tienda +
    // badge núcleo + esconde discriminadores; para verticales, vidriera plana legada.
    filas: vistaModulos(state, catalogo(), tiendaProducto(producto)),
    rubro: state.blueprintId,
    producto,
    enforced: moduleRegistryEnabled(),
  };
}

/** El id de producto que activa la piel de tienda en `vistaModulos`, o `undefined` (vertical → vidriera plana). */
function tiendaProducto(producto: Producto): string | undefined {
  return productoUsaTienda(producto) ? producto : undefined;
}

/**
 * Activa o desactiva un módulo del tenant. `formData`: `id` (módulo) + `accion`
 * ("activar" | "desactivar"). Valida la variante/dependencias con los planes PUROS;
 * si el plan falla, vuelve con el motivo y NO toca la asignación.
 */
export async function toggleModulo(formData: FormData) {
  await requireCapability("modules:manage");
  const tenantId = await getCurrentTenantId();

  const id = String(formData.get("id") ?? "").trim();
  const accion = String(formData.get("accion") ?? "").trim();
  if (!id || (accion !== "activar" && accion !== "desactivar")) {
    backWith("error", "Pedido inválido.");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { blueprintId: true, modules: true },
  });
  if (!tenant) backWith("error", "No se encontró el negocio.");

  const registry = catalogo();
  // Producto → activa el candado del núcleo al desinstalar (un módulo del plan no se apaga).
  const producto = derivarProducto({ blueprintId: tenant.blueprintId, modules: tenant.modules });
  const plan =
    accion === "activar"
      ? planActivar(tenant.modules, id, registry, tenant.blueprintId)
      : planDesactivar(tenant.modules, id, registry, tiendaProducto(producto));

  if (plan.error) backWith("error", plan.error);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { modules: plan.modules },
  });

  await auditAdmin({
    action: accion === "activar" ? "module.activate" : "module.deactivate",
    entity: "Tenant",
    entityId: tenantId,
    changes: { modulo: id, incluidos: plan.incluidos, modules: plan.modules },
  });

  // La asignación cambia lo que el producto ofrece → refrescamos backoffice y vidriera.
  revalidatePath(MODULOS_PATH);
  revalidatePath("/");

  const nombre = registry.buscar(id)?.nombre ?? id;
  if (accion === "activar") {
    const extra =
      plan.incluidos.length > 0
        ? ` (se activaron también: ${plan.incluidos
            .map((x) => registry.buscar(x)?.nombre ?? x)
            .join(", ")})`
        : "";
    backWith("ok", `Activaste “${nombre}”.${extra}`);
  }
  backWith("ok", `Apagaste “${nombre}”.`);
}
