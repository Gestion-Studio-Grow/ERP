"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion } from "@/lib/require-app";
import { collectReceivable } from "@/lib/debts/receivable-service";
import { MEDIO_OBLIGATORIO, cuentasCorrientesEnabled, leerMedio } from "@/lib/settlement/asiento-libro";
import { leerMonto, leerTexto, mensajeDeRechazo, type EstadoFormularioCuenta } from "@/lib/debts/formularios";
import { fmtMoneyARS } from "@/components/ui/format";

// Registrar un COBRO parcial contra una cuenta a cobrar (fiado) → se asienta como
// Collection (D9, originType RECEIVABLE) vía el servicio de S1. La validación de saldo
// (no sobre-cobrar) es la MISMA regla del server (`validateNewCollection` dentro de
// `applyCollectionInTx`, en la transacción del cobro) que el form ya corre en cliente para
// feedback inmediato.
//
// El MEDIO es obligatorio: si no viene, no se cobra. Antes, sin medio se suponía efectivo, y
// un cobro por transferencia anotado como efectivo descuadra el cajón. Con
// CUENTAS_CORRIENTES_ENABLED el cobro además entra al libro de caja en la misma transacción
// (y se frena si hoy ya está cerrado); por eso se revalidan el libro y el cierre.
//
// DEVUELVE el resultado al formulario (useActionState) en vez de tirar: un rechazo (día
// cerrado, medio sin elegir, monto de más) se muestra al lado del botón y lo cargado queda.
// Antes tiraba y el formulario fallaba mudo.
//
// "use server" publica cada export como endpoint: el negocio sale de la sesión, nunca de un
// parámetro, y pasa por `requireAppAccion("cuentas-a-cobrar")`, la misma regla que la página
// (rol, módulo y edición). Antes pedía sólo billing:manage: se entraba por la URL aunque el
// negocio no tuviera la app.
export async function registerReceivableCollection(
  _prev: EstadoFormularioCuenta,
  formData: FormData,
): Promise<EstadoFormularioCuenta> {
  try {
    const user = await requireAppAccion("cuentas-a-cobrar");
    const tenantId = await getCurrentTenantId();

    const id = leerTexto(formData.get("id"), 64);
    if (!id) return { estado: "error", mensaje: "No encontramos la cuenta. Recargá la pantalla y volvé a intentar." };
    // "100.000" son cien mil pesos: el monto se lee con la regla de la plata (`leerImporte`).
    const amount = leerMonto(formData.get("monto"));
    if (amount === null) return { estado: "error", mensaje: "Poné el monto del cobro, mayor a cero." };
    const method = leerMedio(formData.get("metodo"));
    if (!method) return { estado: "error", mensaje: MEDIO_OBLIGATORIO };
    const note = leerTexto(formData.get("nota"), 200) || null;

    const r = await collectReceivable(tenantId, id, { amount, method, note, by: `user:${user.id}` });
    const enLibro = cuentasCorrientesEnabled();

    revalidatePath(`/admin/cuentas-a-cobrar/${id}`);
    revalidatePath("/admin/cuentas-a-cobrar");
    revalidatePath("/admin/flujo");
    if (enLibro) {
      revalidatePath("/admin/caja/libro");
      revalidatePath("/admin/caja/cierre");
    }
    const saldo = r.settlement.balance > 0 ? `Queda debiendo ${fmtMoneyARS(r.settlement.balance)}.` : "La cuenta quedó saldada.";
    return {
      estado: "ok",
      mensaje: `Cobro de ${fmtMoneyARS(r.amount)} registrado. ${saldo}${enLibro ? " Ya está en el libro de caja de hoy." : ""}`,
    };
  } catch (e) {
    unstable_rethrow(e);
    return { estado: "error", mensaje: mensajeDeRechazo(e, "cobro") };
  }
}
