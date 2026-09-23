"use server";

// RECIBIR MERCADERÍA — la acción del formulario de /admin/compras.
//
// Es la que antes era `createStockPurchase` (src/lib/stock-actions.ts), más lo que faltaba: la
// compra A CUENTA CORRIENTE, que en vez del egreso de caja deja la deuda con el proveedor en la
// misma transacción, con su vencimiento y el número de factura. La aritmética, la lectura de
// las líneas y la decisión del pago son puras y viven en src/lib/stock/purchase-core.ts y
// purchase-egreso.ts (testeadas en recibir.test.ts); acá sólo están las guardias, el adaptador
// FormData → PurchaseInput, la auditoría y la respuesta a la pantalla.
//
// "use server" publica cada export como endpoint: el único export es la acción, y no recibe
// ningún tenantId (el negocio es el del request).
//
// GUARDIAS, todas en el servidor:
//   1. `requireAppAccion("recibir-mercaderia")`: la misma regla que el menú y la página.
//   2. `stock:receive`: el encargado (RECEPTION) recibe; sin `costs:read` su recepción entra SIN
//      costo y SIN pago (lo que llegue se ignora): suma el stock y graba el proveedor.
//   3. A cuenta corriente, además, que el negocio pueda abrir Cuentas a pagar: una deuda que
//      nadie puede ver ni pagar sería un callejón sin salida.
//
// Devuelve el error en vez de tirarlo: si se escapa, Next en producción lo reemplaza por la
// pantalla genérica y la persona pierde el remito cargado.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { roleHasCapability } from "@/lib/capabilities";
import { requireAppAccion } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { insertStockPurchase, lineasDeLaRecepcion, pagoDeLaRecepcion, type StockPurchaseKind } from "@/lib/stock/purchase-core";
import { composeFormalNotes } from "@/lib/stock/formal-order";
import { fmtMoneyARS } from "@/components/ui/format";

/** Lo que vuelve a la pantalla (`useEnvio`). `deudaId`: la cuenta a pagar que nació, si hubo. */
export type EstadoRecepcion = null | { ok: true; mensaje: string; deudaId?: string } | { ok: false; error: string };

const PATHS = [
  "/admin/compras",
  "/admin/compras/sugerido",
  "/admin/catalogo",
  "/admin/pedidos",
  "/admin/inventario",
  "/admin/proveedores",
  "/admin/cuentas-a-pagar",
];

/** "2026-10-23" → "23/10/2026", sin pasar por un instante (es un día, no una hora). */
function fechaDelDia(dia: string): string {
  const [y, m, d] = dia.split("-");
  return `${d}/${m}/${y}`;
}

export async function recibirMercaderia(_prev: EstadoRecepcion, formData: FormData): Promise<EstadoRecepcion> {
  try {
    const user = await requireAppAccion("recibir-mercaderia");
    if (!roleHasCapability(user.role, "stock:receive")) {
      return { ok: false, error: "Tu usuario no puede recibir mercadería. Pedíselo a la dueña o al dueño." };
    }
    const conCostos = roleHasCapability(user.role, "costs:read");
    const tenantId = await getCurrentTenantId();

    const kind: StockPurchaseKind = String(formData.get("kind") || "COMPRA").trim() === "REPOSICION" ? "REPOSICION" : "COMPRA";

    // CÓMO SE PAGÓ (`pagoDeLaRecepcion`, testeada): el medio elegido, o a cuenta corriente con
    // vencimiento y factura. Una reposición interna, o quien no ve costos, no informa pago. Si
    // no llega nada (submit sin JS), `purchase-core` cae a `PAGO_POR_DEFECTO`, que lo marca.
    const pago = pagoDeLaRecepcion(kind, conCostos, {
      pago: formData.get("pago"),
      vence: formData.get("vence"),
      factura: formData.get("factura"),
    });
    if (pago?.estado === "CUENTA_CORRIENTE") {
      const negocio = await getNegocioApps(user.role);
      if (!appPermitida(appPorId("cuentas-a-pagar"), negocio)) {
        return {
          ok: false,
          error: "Tu negocio no tiene Cuentas a pagar, así que la deuda no se podría ver ni pagar. Elegí cómo se pagó.",
        };
      }
    }

    const result = await insertStockPurchase(tenantId, {
      kind,
      ...(pago ? { pago } : {}),
      supplierId: String(formData.get("supplierId") || "").trim() || null,
      supplier: String(formData.get("supplier") || "").trim() || null,
      // Orden formal a proveedor (perfil Empresa, J45/18J): el CUIT y el N° de orden viajan
      // en campos propios pero se COMPONEN dentro de `notes` (lossless, sin columna nueva).
      notes: composeFormalNotes({
        orderNumber: String(formData.get("orderNumber") || ""),
        cuit: String(formData.get("cuit") || ""),
        note: String(formData.get("notes") || ""),
      }),
      createdBy: `user:${user.id}`,
      items: lineasDeLaRecepcion(
        formData.getAll("productId").map(String),
        formData.getAll("quantity").map(String),
        formData.getAll("unitCost").map(String),
        conCostos,
      ),
    });

    await auditAdmin({
      action: "create",
      entity: "StockPurchase",
      entityId: result.id,
      changes: {
        code: result.code,
        kind,
        totalCost: result.totalCost,
        lines: result.lines,
        sinCostosPorRol: !conCostos,
        // El asiento de caja SE AUDITA: "compra #12 registrada, egreso no asentado porque es a
        // cuenta corriente" es un hecho que hay que poder reconstruir después, y `medioAsumido`
        // es lo único que distingue un medio elegido de uno asumido.
        egresoAsentado: result.egreso.asentado,
        ...(result.egreso.asentado
          ? {
              egresoMetodo: result.egreso.method,
              egresoMedioAsumido: result.egreso.medioAsumido,
              egresoDia: result.egreso.dia,
              egresoDiferidoPorCierre: result.egreso.diferidoPorCierre,
            }
          : { egresoMotivo: result.egreso.motivo }),
        ...(result.deuda ? { deudaId: result.deuda.payableId, deudaMonto: result.deuda.amount, deudaVence: result.deuda.vence } : {}),
      },
    });
    // La deuda también se audita sola: es lo que la dueña busca en Cuentas a pagar.
    if (result.deuda) {
      await auditAdmin({
        action: "create",
        entity: "AccountPayable",
        entityId: result.deuda.payableId,
        changes: {
          origen: "compra-a-cuenta-corriente",
          compra: result.code,
          monto: result.deuda.amount,
          detalle: result.deuda.concept,
          vence: result.deuda.vence,
        },
      });
    }
    for (const p of PATHS) revalidatePath(p);

    const que = kind === "COMPRA" ? "Compra" : "Reposición";
    const base = `${que} #${result.code} registrada: ${result.lines === 1 ? "1 producto" : `${result.lines} productos`} con el stock actualizado.`;
    if (!result.deuda) return { ok: true, mensaje: base };
    const vence = result.deuda.vence ? `, vence el ${fechaDelDia(result.deuda.vence)}` : ", sin vencimiento";
    return {
      ok: true,
      mensaje: `${base} Quedó a cuenta corriente: ${fmtMoneyARS(result.deuda.amount)}${vence}. No salió plata de la caja.`,
      deudaId: result.deuda.payableId,
    };
  } catch (err) {
    // La sesión vencida llega como un redirect de Next: se deja pasar.
    unstable_rethrow(err);
    return { ok: false, error: err instanceof Error && err.message ? err.message : "No se pudo registrar. Probá de nuevo." };
  }
}
