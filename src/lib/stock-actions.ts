"use server";

// Capability COMPRAS / REPOSICIÓN de stock del POS — la contracara de la venta.
// Server Actions scoped por tenant, mismo patrón que order-actions.ts: guard de
// capability al tope, getCurrentTenantId (fail-closed ADR-015) en cada write,
// audit + revalidatePath al terminar.
//
// La aritmética (armar líneas, snapshot de costo, total) y el incremento de stock
// viven puros/aislados en src/lib/stock/purchase-core.ts (unit-testeados). Acá solo
// están el guard, el adaptador FormData → PurchaseInput y el loader de pantalla.
//
// Reusa `catalog:manage`: reponer stock y registrar compras es gestión de catálogo
// del mismo tenor que cargar productos y precios. No se agrega una capability nueva
// para no inflar el RBAC (gobierno calidad-vs-costo); si más adelante hace falta
// separar "comprar" de "editar catálogo", se agrega un renglón en capabilities.ts.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { insertStockPurchase, type StockPurchaseKind } from "@/lib/stock/purchase-core";
import { composeFormalNotes } from "@/lib/stock/formal-order";
import { parseCashMethod } from "@/lib/comision-liquidacion";
import { cantidadDelFormulario, importeDelFormulario } from "@/lib/pos-peso";

const STOCK_PATH = "/admin/compras";

// --- Loader de la pantalla de compras/reposición ---
//
// Devuelve los productos reponibles (activos, no borrados) para el selector y las
// últimas entradas registradas para el histórico. Guard de lectura por
// `catalog:read`. Se traen los productos con su stock/unidad actuales para que el
// operador vea cuánto hay antes de reponer.
export async function getStockData() {
  await requireCapability("catalog:read");
  const tenantId = await getCurrentTenantId();
  const [products, recent] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, deletedAt: null, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, stock: true, lowStockAt: true },
    }),
    prisma.stockPurchase.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { items: { orderBy: { name: "asc" } } },
    }),
  ]);
  return { products, recent };
}

// Parsea las líneas (arrays paralelos productId[]/quantity[]/unitCost[], patrón
// getAll del Core, igual que order-actions.parseItems) a la forma del core.
//
// Se leen con las MISMAS funciones que la pantalla: la cantidad con `cantidadDelFormulario`
// (coma decimal, gramos) y el costo con `importeDelFormulario` ("6.543" son miles). Antes
// era `Number(x.replace(",", "."))`: "12.500" de costo se leía 12,5 y un valor ilegible
// llegaba NaN y la línea se descartaba sin avisar, con el egreso del libro saliendo por
// menos. Ahora lo ilegible LANZA con un mensaje. En CH esto es plata del libro: el total de
// la compra es el egreso que se asienta (ver purchase-egreso.test.ts).
function parseLines(formData: FormData): { productId: string; qty: number; unitCost: number }[] {
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
      unitCost: importeDelFormulario(unitCosts[i], `Línea ${i + 1}, costo`) ?? 0,
    };
  });
}

// --- Registrar una compra / reposición ---
//
// Crea el documento + líneas e INCREMENTA el stock de cada producto (el core lo hace
// atómico en una transacción). Requiere capability de gestión de catálogo.
export async function createStockPurchase(formData: FormData) {
  const user = await requireCapability("catalog:manage");
  const tenantId = await getCurrentTenantId();

  const kindRaw = String(formData.get("kind") || "COMPRA").trim();
  const kind: StockPurchaseKind = kindRaw === "REPOSICION" ? "REPOSICION" : "COMPRA";

  // Orden formal a proveedor (perfil Empresa, J45/18J): el CUIT y el N° de orden viajan
  // en campos propios pero se COMPONEN dentro de `notes` (lossless, sin columna nueva;
  // columnas dedicadas = §C). Retrocompatible: para Comercio esos campos no llegan y
  // `composeFormalNotes` devuelve la nota libre tal cual (o null), como antes.
  // CÓMO SE PAGÓ. El formulario ahora lo pregunta (`<Select name="pago">`) y no deja
  // registrar una COMPRA sin elegirlo. Si igual no llega —submit sin JS, o un llamador que
  // no es este formulario— se cae al backstop de `purchase-core` (`PAGO_POR_DEFECTO`), que
  // asume efectivo y lo MARCA en el detalle de la fila del libro y en `medioAsumido`. Nunca
  // se asume en silencio: asumir mal descuadra el arqueo por el importe completo.
  //
  // Una REPOSICIÓN interna no mueve plata, así que no tiene medio que informar.
  const method = kind === "COMPRA" ? parseCashMethod(formData.get("pago")) : null;

  const result = await insertStockPurchase(tenantId, {
    kind,
    ...(method ? { pago: { estado: "PAGADA" as const, method } } : {}),
    supplier: String(formData.get("supplier") || "").trim() || null,
    notes: composeFormalNotes({
      orderNumber: String(formData.get("orderNumber") || ""),
      cuit: String(formData.get("cuit") || ""),
      note: String(formData.get("notes") || ""),
    }),
    createdBy: `user:${user.id}`,
    items: parseLines(formData),
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
      // El asiento de caja SE AUDITA acá. `purchase-core.ts` afirmaba por escrito que "la
      // Server Action lo audita" y no lo hacía: "compra #12 registrada, egreso no asentado
      // porque es a cuenta corriente" es un hecho que hay que poder reconstruir después, y
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
  revalidatePath(STOCK_PATH);
  // El stock repuesto también cambia lo que muestra el catálogo y el POS.
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin/pedidos");
}
