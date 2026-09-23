"use server";

// Registrar una DEVOLUCIÓN a proveedor (D4): todas las líneas y el crédito en UNA transacción
// (`registrarDevolucion`, supplier-return.ts). Si una línea no sirve, no se escribe nada y la
// pantalla muestra el error de cada línea. AUTORIDAD SERVER: el costo y lo comprado de cada
// línea se leen de la compra adentro de la transacción, no del formulario.
//
// "use server" publica cada export como endpoint: nada recibe el negocio por parámetro y todo
// pasa por `requireAppAccion("devoluciones-a-proveedor")` (rol, módulo, edición: la misma regla
// que la página y el menú).

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion } from "@/lib/require-app";
import { parseCashMethod } from "@/lib/comision-liquidacion";
import { DevolucionRechazada, registrarDevolucion, type DestinoDelCredito, type ErrorDeLinea } from "@/lib/stock/supplier-return";

export type EstadoDevolucion =
  | null
  | { ok: true; mensaje: string }
  | { ok: false; error: string; errores?: ErrorDeLinea[] };

function leerDestino(fd: FormData): DestinoDelCredito | null {
  const tipo = String(fd.get("destino") ?? "");
  if (tipo === "deuda") return { tipo: "deuda" };
  if (tipo === "ninguno") return { tipo: "ninguno" };
  if (tipo === "caja") {
    const method = parseCashMethod(fd.get("medio"));
    return method ? { tipo: "caja", method } : null;
  }
  return null;
}

const pesos = (n: number) => `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)}`;

export async function registrarDevolucionAccion(_prev: EstadoDevolucion, fd: FormData): Promise<EstadoDevolucion> {
  try {
    const user = await requireAppAccion("devoluciones-a-proveedor");
    const tenantId = await getCurrentTenantId();
    const purchaseId = String(fd.get("purchaseId") ?? "").trim();
    if (!purchaseId) return { ok: false, error: "Elegí la compra de la que devolvés." };
    const destino = leerDestino(fd);
    if (!destino) return { ok: false, error: "Elegí qué pasa con la plata: se descuenta de la deuda, te la devuelven, o sin reintegro." };
    const motivo = String(fd.get("motivo") ?? "").trim() || null;
    const productIds = fd.getAll("productId").map(String);
    const cantidades = fd.getAll("qty").map(String);
    if (productIds.length !== cantidades.length) {
      return { ok: false, error: "La devolución llegó incompleta. Volvé a cargarla." };
    }

    const r = await registrarDevolucion(tenantId, {
      purchaseId,
      motivo,
      lineas: productIds.map((productId, i) => ({ productId, cantidad: cantidades[i] })),
      destino,
      by: `user:${user.id}`,
    });

    await auditAdmin({
      action: "create",
      entity: "DevolucionProveedor",
      entityId: purchaseId,
      changes: { compra: r.code, lineas: r.lineas, total: r.total, destino: r.destino, saldoDeuda: r.saldoDeuda, motivo },
    });
    for (const p of ["/admin/devoluciones-proveedor", "/admin/inventario", "/admin/compras", "/admin/proveedores", "/admin/caja", "/admin/caja/libro"]) {
      revalidatePath(p);
    }
    const plata =
      r.destino === "deuda"
        ? `Se descontaron ${pesos(r.total)} de la deuda${r.saldoDeuda !== null ? ` (queda ${pesos(r.saldoDeuda)})` : ""}.`
        : r.destino === "caja"
          ? `Entraron ${pesos(r.total)} a la caja.`
          : "Sin reintegro de plata.";
    return {
      ok: true,
      mensaje: `Devolución de la compra #${r.code} registrada: ${r.lineas === 1 ? "1 producto" : `${r.lineas} productos`} salieron del stock. ${plata}`,
    };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof DevolucionRechazada) return { ok: false, error: err.message, errores: err.errores };
    return { ok: false, error: err instanceof Error && err.message ? err.message : "No se pudo registrar. Probá de nuevo." };
  }
}
