"use server";

// RECIBIR MERCADERÍA (compras / reposición de stock) — la contracara de la venta.
//
// La aritmética (armar líneas, snapshot de costo, total) y el incremento de stock viven
// puros/aislados en src/lib/stock/purchase-core.ts (unit-testeados). Acá sólo están las
// guardias, el adaptador FormData → PurchaseInput y la respuesta a la pantalla.
//
// "use server" publica cada export como endpoint: el loader de la pantalla ya no vive acá
// (src/lib/inventario/compras-loader.ts) y ningún export recibe un tenantId.
//
// GUARDIAS, las dos en el servidor:
//   1. `requireAppAccion("recibir-mercaderia")`: la misma regla que el menú y la página
//      (rol × módulo × rubro × edición). Esconder la app no alcanza: el endpoint existe.
//   2. `stock:receive`: recibir mercadería. El encargado (RECEPTION) la tiene; lo que no tiene
//      es `costs:read`, así que su recepción entra SIN costos y sin medio de pago (el servidor
//      los ignora aunque lleguen): suma el stock y graba el proveedor; la plata la carga la
//      dueña.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { roleHasCapability } from "@/lib/capabilities";
import { requireAppAccion } from "@/lib/require-app";
import { costoDeLaLinea, insertStockPurchase, medioDeLaRecepcion, type StockPurchaseKind } from "@/lib/stock/purchase-core";
import { composeFormalNotes } from "@/lib/stock/formal-order";
import { parseCashMethod } from "@/lib/comision-liquidacion";
import { cantidadDelFormulario, importeDelFormulario } from "@/lib/pos-peso";

/** Lo que vuelve a la pantalla (`useActionState`). */
export type EstadoCompra = null | { ok: true; mensaje: string } | { ok: false; error: string };

const PATHS = ["/admin/compras", "/admin/catalogo", "/admin/pedidos", "/admin/inventario", "/admin/proveedores"];

// Parsea las líneas (arrays paralelos productId[]/quantity[]/unitCost[], patrón getAll del
// Core, igual que order-actions.parseItems) a la forma del core.
//
// Se leen con las MISMAS funciones que la pantalla: la cantidad con `cantidadDelFormulario`
// (coma decimal, gramos) y el costo con `importeDelFormulario` ("6.543" son miles). Lo ilegible
// LANZA con un mensaje. En CH esto es plata del libro: el total de la compra es el egreso que
// se asienta (ver purchase-egreso.test.ts). Sin `conCostos`, el costo NO se lee: vale 0
// (`costoDeLaLinea`, purchase-core.ts, testeada).
function parseLines(formData: FormData, conCostos: boolean): { productId: string; qty: number; unitCost: number }[] {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const unitCosts = formData.getAll("unitCost").map(String);
  return productIds.map((id, i) => {
    const qty = cantidadDelFormulario(quantities[i], `Línea ${i + 1}, cantidad`);
    if (qty == null) throw new Error(`Línea ${i + 1}: falta la cantidad.`);
    return {
      productId: id,
      qty,
      // El costo es opcional (reposición sin costo): vacío es 0, no un error.
      unitCost: costoDeLaLinea(conCostos, () => importeDelFormulario(unitCosts[i], `Línea ${i + 1}, costo`)),
    };
  });
}

// --- Registrar una compra / reposición ---
//
// Crea el documento + líneas e INCREMENTA el stock de cada producto (el core lo hace
// atómico en una transacción, con el egreso de caja si corresponde).
export async function createStockPurchase(_prev: EstadoCompra, formData: FormData): Promise<EstadoCompra> {
  try {
    const user = await requireAppAccion("recibir-mercaderia");
    if (!roleHasCapability(user.role, "stock:receive")) {
      return { ok: false, error: "Tu usuario no puede recibir mercadería. Pedíselo a la dueña o al dueño." };
    }
    const conCostos = roleHasCapability(user.role, "costs:read");
    const tenantId = await getCurrentTenantId();

    const kindRaw = String(formData.get("kind") || "COMPRA").trim();
    const kind: StockPurchaseKind = kindRaw === "REPOSICION" ? "REPOSICION" : "COMPRA";

    // Orden formal a proveedor (perfil Empresa, J45/18J): el CUIT y el N° de orden viajan
    // en campos propios pero se COMPONEN dentro de `notes` (lossless, sin columna nueva).
    // CÓMO SE PAGÓ. El formulario lo pregunta (`<Select name="pago">`) y no deja registrar una
    // COMPRA sin elegirlo. Si igual no llega —submit sin JS, o un llamador que no es este
    // formulario— se cae al backstop de `purchase-core` (`PAGO_POR_DEFECTO`), que asume
    // efectivo y lo MARCA en el detalle de la fila del libro y en `medioAsumido`.
    //
    // Una REPOSICIÓN interna no mueve plata, así que no tiene medio que informar. Y quien no ve
    // costos tampoco informa medio: su recepción entra sin costo y no mueve la caja
    // (`medioDeLaRecepcion`, purchase-core.ts, testeada).
    const method = medioDeLaRecepcion(kind, conCostos, parseCashMethod(formData.get("pago")));

    const result = await insertStockPurchase(tenantId, {
      kind,
      ...(method ? { pago: { estado: "PAGADA" as const, method } } : {}),
      supplierId: String(formData.get("supplierId") || "").trim() || null,
      supplier: String(formData.get("supplier") || "").trim() || null,
      notes: composeFormalNotes({
        orderNumber: String(formData.get("orderNumber") || ""),
        cuit: String(formData.get("cuit") || ""),
        note: String(formData.get("notes") || ""),
      }),
      createdBy: `user:${user.id}`,
      items: parseLines(formData, conCostos),
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
        // El asiento de caja SE AUDITA acá: "compra #12 registrada, egreso no asentado porque
        // es a cuenta corriente" es un hecho que hay que poder reconstruir después, y
        // `medioAsumido` es lo único que distingue un medio elegido de uno asumido.
        egresoAsentado: result.egreso.asentado,
        ...(result.egreso.asentado
          ? {
              egresoMetodo: result.egreso.method,
              egresoMedioAsumido: result.egreso.medioAsumido,
              egresoDia: result.egreso.dia,
              egresoDiferidoPorCierre: result.egreso.diferidoPorCierre,
            }
          : { egresoMotivo: result.egreso.motivo }),
      },
    });
    for (const p of PATHS) revalidatePath(p);
    const que = kind === "COMPRA" ? "Compra" : "Reposición";
    return {
      ok: true,
      mensaje: `${que} #${result.code} registrada: ${result.lines === 1 ? "1 producto" : `${result.lines} productos`} con el stock actualizado.`,
    };
  } catch (err) {
    // La sesión vencida llega como un redirect de Next: se deja pasar.
    unstable_rethrow(err);
    return { ok: false, error: err instanceof Error && err.message ? err.message : "No se pudo registrar. Probá de nuevo." };
  }
}
