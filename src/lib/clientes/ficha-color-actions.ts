"use server";
// Alta de una ficha técnica de color (paquete Peluquerías, T4).
// Cuida: sesión + `clients:manage`; sólo rubros peluqueria/barberia; la clienta tiene que ser del
// negocio (predicado tenantId + RLS); validación de sólo datos técnicos (ficha-color-core.ts);
// sin la migración aplicada responde «migración pendiente» en vez de romper.
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { getBrandSheet } from "@/lib/brand-sheet";
import { esMigracionPendiente, rubroConFichaDeColor, validarFichaColor } from "./ficha-color-core";

export type EstadoAltaFichaColor = { ok: boolean; mensaje: string } | null;

export async function registrarFichaColor(_prev: EstadoAltaFichaColor, form: FormData): Promise<EstadoAltaFichaColor> {
  const user = await requireCapability("clients:manage");
  const marca = await getBrandSheet();
  if (!rubroConFichaDeColor(marca.blueprintId)) return { ok: false, mensaje: "La ficha de color no está disponible en este negocio." };
  const clientId = String(form.get("clientId") ?? "");
  const v = validarFichaColor(Object.fromEntries(form));
  if (!v.ok) return { ok: false, mensaje: v.error };
  const tenantId = await getCurrentTenantId();
  try {
    const creada = await tenantTransaction(
      async (tx) => {
        const clienta = await tx.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true } });
        if (!clienta) return false;
        await tx.fichaColor.create({ data: { ...v.datos, tenantId, clientId, createdBy: user.id } });
        return true;
      },
      { tenantId },
    );
    if (!creada) return { ok: false, mensaje: "No encontré esa clienta en este negocio. Recargá la ficha." };
  } catch (e) {
    if (esMigracionPendiente(e)) return { ok: false, mensaje: "La ficha de color todavía no está habilitada (migración pendiente)." };
    throw e;
  }
  revalidatePath(`/admin/clientes/${clientId}`);
  return { ok: true, mensaje: "Ficha de color guardada." };
}
