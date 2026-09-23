"use server";

// ============================================================================
// Server Actions de Catálogo y precios — aplicar un aumento y registrar una impresión.
// ============================================================================
//
// Cada export de este archivo es un endpoint. Ninguno recibe `tenantId`: sale de la sesión.
// Todo lo que llega del navegador se valida campo por campo antes de usarlo
// (`pedidoDesdeAfuera`, `idsDesdeAfuera`, `esPlantilla`).
//
// LA GUARDIA es `requireAppAccion`, la misma regla que la página (rol, módulo, rubro): una
// app oculta no es una app protegida, y la acción se puede llamar sin pasar por la pantalla.
// La capability de estas dos apps es `catalog:manage`, así que `requireAppAccion` ya exige el
// permiso de cambiar precios.
//
// "Aplicar" NO confía en la vista previa del navegador: vuelve a leer el catálogo y a armar el
// plan ADENTRO de la transacción que escribe. Lo único que usa de la pantalla es la huella,
// para negarse si el plan de ahora no es el que la persona vio. La transacción es
// Serializable: dos "Aplicar" a la vez (doble clic, dos pestañas) no pueden escribir los dos.
// Postgres aborta el segundo (40001); acá se reintenta, relee los precios ya cambiados, su
// huella ya no coincide y vuelve con "los precios cambiaron", en vez de aplicar el aumento dos
// veces. Medido contra el Postgres local con dos transacciones a la vez: una aplica, la otra
// aborta, y el precio queda con UN solo aumento y UN registro.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AppNoDisponibleError, requireAppAccion } from "@/lib/require-app";
import type { AppId } from "@/apps/registro";
import type { SessionUser } from "@/lib/session";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { todayInBusinessTz } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import { pedidoDesdeAfuera, precioDeVenta } from "./aumento-core";
import { aplicarAumentoEnTx, esConflictoDeSerializacion, type ResultadoAumento } from "./precios-tx";
import { filasEtiquetaImpresa } from "./precios-auditoria";
import { esPlantilla, idsDesdeAfuera, type DatosEtiqueta } from "./etiquetas-core";

/** Reintentos ante un conflicto con otro "Aplicar" simultáneo. El segundo intento ya alcanza. */
const MAX_INTENTOS = 3;

export type ResultadoImpresion =
  | { ok: true; etiquetas: DatosEtiqueta[]; hoy: string }
  | { ok: false; mensaje: string };

/**
 * La guardia de la app. Devuelve el usuario, o el mensaje de "App no disponible" listo para
 * mostrar. Sólo se atrapa `AppNoDisponibleError`: el redirect al login (sin sesión) tiene que
 * seguir su camino.
 */
async function entrar(app: AppId): Promise<SessionUser | { mensaje: string }> {
  try {
    return await requireAppAccion(app);
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { mensaje: e.message };
    throw e;
  }
}

/**
 * Aplica un aumento (o una baja) de precios: TODO o NADA, en una transacción, con una fila de
 * auditoría por producto. `huella` es la del plan que la persona vio; `confirmado` es la
 * confirmación extra que pide un cambio de más del 30 %.
 */
export async function aplicarAumento(pedidoCrudo: unknown, huella: unknown, confirmado: unknown): Promise<ResultadoAumento> {
  const acceso = await entrar("actualizar-precios");
  if ("mensaje" in acceso) return { ok: false, mensaje: acceso.mensaje };
  const pedido = pedidoDesdeAfuera(pedidoCrudo);
  if (!pedido) return { ok: false, mensaje: "El pedido llegó incompleto. Recargá la pantalla y volvé a armarlo." };
  const tenantId = await getCurrentTenantId();
  const actor = `user:${acceso.id}`;
  const lote = randomUUID();

  const intentar = () =>
    tenantTransaction(
      (tx) => aplicarAumentoEnTx(tx, { tenantId, actor, lote, pedido, huella: String(huella ?? ""), confirmado: confirmado === true }),
      { tenantId, isolationLevel: "Serializable" },
    );

  let resultado: ResultadoAumento | null = null;
  for (let intento = 1; resultado === null; intento++) {
    try {
      resultado = await intentar();
    } catch (err) {
      // Otro "Aplicar" escribió las mismas filas al mismo tiempo: se vuelve a intentar, y el
      // intento nuevo lee los precios ya cambiados (su huella no coincide y no escribe nada).
      if (esConflictoDeSerializacion(err) && intento < MAX_INTENTOS) continue;
      logger.error("catalogo/precios", "no se pudo aplicar el aumento", err);
      // Los mensajes propios dicen qué pasó y qué hacer; lo demás no se filtra a la pantalla.
      const propio = err instanceof Error && /^Se (esperaban|cambiaron)/.test(err.message) ? err.message : null;
      return { ok: false, mensaje: propio ?? "No se pudieron cambiar los precios. No se guardó nada: probá de nuevo." };
    }
  }

  if (resultado.ok) {
    revalidatePath("/admin/catalogo", "layout"); // catálogo, actualizar precios y etiquetas
    revalidatePath("/admin/vender"); // el mostrador cobra con el precio de acá
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin");
  }
  return resultado;
}

/**
 * Registra que se imprimieron las etiquetas de `ids` y devuelve lo que hay que imprimir, con
 * el precio de AHORA leído en la misma transacción que registra: lo que sale en el papel es
 * lo que queda anotado. Los productos sin precio de venta no llevan etiqueta y no se anotan.
 */
export async function registrarImpresion(idsCrudos: unknown, plantillaCruda: unknown): Promise<ResultadoImpresion> {
  const acceso = await entrar("etiquetas-de-precio");
  if ("mensaje" in acceso) return { ok: false, mensaje: acceso.mensaje };
  const ids = idsDesdeAfuera(idsCrudos);
  if (!ids) return { ok: false, mensaje: "Elegí al menos una etiqueta para imprimir." };
  if (!esPlantilla(plantillaCruda)) return { ok: false, mensaje: "Elegí la plantilla: hoja A4 o rollo." };
  const plantilla = plantillaCruda;
  const tenantId = await getCurrentTenantId();
  const actor = `user:${acceso.id}`;

  try {
    const etiquetas = await tenantTransaction(
      async (tx) => {
        const productos = await tx.product.findMany({
          where: { tenantId, deletedAt: null, id: { in: ids } },
          select: { id: true, name: true, unit: true, saleUnit: true, price: true, pricePerKg: true },
          orderBy: { name: "asc" },
        });
        const salen: DatosEtiqueta[] = productos.flatMap((p) => {
          const saleUnit = p.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT";
          const precio = precioDeVenta({ saleUnit, price: p.price, pricePerKg: p.pricePerKg });
          return precio === null ? [] : [{ id: p.id, nombre: p.name, saleUnit, precio, unidad: p.unit }];
        });
        if (salen.length > 0) {
          await tx.auditLog.createMany({
            data: filasEtiquetaImpresa({
              tenantId,
              actor,
              plantilla,
              etiquetas: salen.map((e) => ({ productId: e.id, nombre: e.nombre, precio: e.precio, saleUnit: e.saleUnit })),
            }),
          });
        }
        return salen;
      },
      { tenantId },
    );
    if (etiquetas.length === 0) {
      return { ok: false, mensaje: "Ninguno de los elegidos tiene precio de venta: no hay etiqueta para imprimir." };
    }
    revalidatePath("/admin/catalogo/etiquetas");
    revalidatePath("/admin");
    return { ok: true, etiquetas, hoy: todayInBusinessTz() };
  } catch (err) {
    logger.error("catalogo/etiquetas", "no se pudo registrar la impresión", err);
    return { ok: false, mensaje: "No se pudo preparar la impresión. No se imprimió nada: probá de nuevo." };
  }
}
