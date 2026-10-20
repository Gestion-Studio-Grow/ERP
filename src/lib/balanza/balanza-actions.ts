"use server";

// ============================================================================
// BALANZA Y LECTOR — guardar el formato de la etiqueta y decir qué PLU es cada producto.
// ============================================================================
//
// El formato es UNO por negocio y es el mismo que lee Caja con lector: se guarda en la misma
// fila vigente (config-repo.ts, sin migración), conservando los encargados que haya elegido la
// caja. El PLU es `Product.codigo` (único por negocio). Las dos cosas cambian cómo se cobra:
// las hace quien administra el catálogo (el dueño), desde la app «Balanza y lector».

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { auditAdmin } from "@/lib/audit-core";
import { motivoDelRechazoDelAlta } from "@/lib/order-core";
import { Prisma } from "@/generated/prisma/client";
import { formatoDelFormulario, formatoDesdeAfuera, problemaDelFormato } from "@/lib/supermercado/balanza";
import { guardarConfigCajaEnTx, leerConfigCaja } from "@/lib/supermercado/config-repo";
import { esChoqueDeUnico, mensajeCodigoOcupado } from "@/lib/catalogo/codigo-producto";

export type EstadoBalanza = { ok: true; mensaje: string } | { ok: false; error: string } | null;

const RUTAS = ["/admin/balanza", "/admin/vender", "/admin/pedidos", "/admin/caja-rapida", "/admin/caja-rapida/configuracion"];

async function dueno(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  try {
    const user = await requireAppAccion("balanza");
    if (!roleHasCapability(user.role, "catalog:manage")) return { ok: false, error: "La balanza la configura el dueño del negocio." };
    return { ok: true, userId: user.id };
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Guarda el formato de la etiqueta de la balanza. */
export async function guardarFormatoDeBalanza(_prev: EstadoBalanza, formData: FormData): Promise<EstadoBalanza> {
  const quien = await dueno();
  if (!quien.ok) return quien;
  const formato = formatoDelFormulario(formData);
  const problema = problemaDelFormato(formato);
  if (problema) return { ok: false, error: problema };
  const valido = formatoDesdeAfuera(formato)!;
  const tenantId = await getCurrentTenantId();
  const versionLeida = String(formData.get("version") ?? "") || null;
  try {
    await tenantTransaction(
      async (tx) => {
        // Los encargados los elige Caja con lector: se guardan como están.
        const actual = await leerConfigCaja(tx, tenantId);
        await guardarConfigCajaEnTx(tx, tenantId, {
          config: { formato: valido, encargados: actual.encargados },
          actor: `user:${quien.userId}`,
          versionLeida,
        });
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    const motivo = motivoDelRechazoDelAlta(err);
    if (motivo !== null) return { ok: false, error: motivo };
    throw err;
  }
  for (const r of RUTAS) revalidatePath(r);
  return { ok: true, mensaje: "Listo: Vender, Pedidos y la caja ya leen las etiquetas con este formato." };
}

/** Pone (o saca, con el campo vacío) el código de la balanza de un producto. */
export async function asignarPluDeProducto(_prev: EstadoBalanza, formData: FormData): Promise<EstadoBalanza> {
  const quien = await dueno();
  if (!quien.ok) return quien;
  const productId = String(formData.get("productId") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim() || null;
  if (!productId) return { ok: false, error: "Falta el producto." };
  if (codigo && !/^\d{1,13}$/.test(codigo)) return { ok: false, error: "El código de la balanza son sólo números (hasta 13)." };
  const tenantId = await getCurrentTenantId();
  const producto = await prisma.product.findFirst({
    where: { id: productId, tenantId, deletedAt: null },
    select: { id: true, name: true, codigo: true },
  });
  if (!producto) return { ok: false, error: "Ese producto ya no está en el catálogo." };
  if (producto.codigo === codigo) return { ok: true, mensaje: `${producto.name}: sin cambios.` };
  try {
    await prisma.product.update({ where: { id: producto.id, tenantId }, data: { codigo } });
  } catch (e) {
    if (codigo && esChoqueDeUnico(e)) {
      const otro = await prisma.product.findFirst({
        where: { tenantId, codigo, NOT: { id: producto.id } },
        select: { name: true, deletedAt: true },
      });
      if (otro) return { ok: false, error: mensajeCodigoOcupado(codigo, { name: otro.name, eliminado: otro.deletedAt !== null }) };
    }
    throw e;
  }
  await auditAdmin({
    action: "update",
    entity: "Product",
    entityId: producto.id,
    changes: { codigo: { antes: producto.codigo, despues: codigo }, desde: "balanza" },
  });
  for (const r of RUTAS) revalidatePath(r);
  return { ok: true, mensaje: codigo ? `${producto.name}: código ${codigo} en la balanza.` : `${producto.name}: sin código de balanza.` };
}
