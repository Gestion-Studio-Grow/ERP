"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion } from "@/lib/require-app";
import { auditAdmin } from "@/lib/audit-core";
import { addChequeToPayable, payPayable, transitionCheque } from "@/lib/debts/payable-service";
import { esEstadoDeCheque, ETIQUETA_CHEQUE } from "@/lib/debts/cheque";
import { MEDIO_OBLIGATORIO, cuentasCorrientesEnabled, leerMedio } from "@/lib/settlement/asiento-libro";
import { leerFecha, leerMonto, leerTexto, mensajeDeRechazo, type EstadoFormularioCuenta } from "@/lib/debts/formularios";
import { fmtMoneyARS } from "@/components/ui/format";

// Registrar un PAGO parcial a una cuenta a pagar (D2) y manejar los CHEQUES PROPIOS que se
// le entregan al proveedor: darlos de alta y cambiarles el estado (entregado, debitado,
// rebotado, anulado). `addChequeToPayable` y `transitionCheque` existían sin pantalla.
//
// El MEDIO del pago es obligatorio (antes se suponía efectivo). Con CUENTAS_CORRIENTES_ENABLED
// el pago —y el cheque que se DEBITA— entra al libro de caja como EGRESO en la misma
// transacción, con el freno de día cerrado; por eso se revalidan el libro y el cierre.
//
// Todas DEVUELVEN el resultado al formulario (useActionState): un rechazo se muestra al lado
// del botón, con lo cargado intacto.
//
// "use server" publica cada export como endpoint: el negocio sale de la sesión y todas pasan
// por `requireAppAccion("cuentas-a-pagar")`, la regla de la página (rol, módulo, edición).

function revalidarCuenta(id: string, conLibro: boolean) {
  revalidatePath(`/admin/cuentas-a-pagar/${id}`);
  revalidatePath("/admin/cuentas-a-pagar");
  revalidatePath("/admin/flujo");
  if (conLibro) {
    revalidatePath("/admin/caja/libro");
    revalidatePath("/admin/caja/cierre");
  }
}

export async function registerPayablePayment(
  _prev: EstadoFormularioCuenta,
  formData: FormData,
): Promise<EstadoFormularioCuenta> {
  try {
    const user = await requireAppAccion("cuentas-a-pagar");
    const tenantId = await getCurrentTenantId();

    const id = leerTexto(formData.get("id"), 64);
    if (!id) return { estado: "error", mensaje: "No encontramos la cuenta. Recargá la pantalla y volvé a intentar." };
    // "100.000" son cien mil pesos: el monto se lee con la regla de la plata (`leerImporte`).
    const amount = leerMonto(formData.get("monto"));
    if (amount === null) return { estado: "error", mensaje: "Poné el monto del pago, mayor a cero." };
    const method = leerMedio(formData.get("metodo"));
    if (!method) return { estado: "error", mensaje: MEDIO_OBLIGATORIO };
    const note = leerTexto(formData.get("nota"), 200) || null;

    const r = await payPayable(tenantId, id, { amount, method, note, by: `user:${user.id}` });
    const enLibro = cuentasCorrientesEnabled();
    revalidarCuenta(id, enLibro);
    const saldo = r.settlement.balance > 0 ? `Queda por pagar ${fmtMoneyARS(r.settlement.balance)}.` : "La deuda quedó saldada.";
    return {
      estado: "ok",
      mensaje: `Pago de ${fmtMoneyARS(r.amount)} registrado. ${saldo}${enLibro ? " Ya está en el libro de caja de hoy." : ""}`,
    };
  } catch (e) {
    unstable_rethrow(e);
    return { estado: "error", mensaje: mensajeDeRechazo(e, "pago") };
  }
}

/**
 * Un cheque propio nuevo contra la deuda. Nace "en la chequera" (sin entregar) o, si así se
 * eligió, ya entregado. No mueve plata: la plata sale cuando el banco lo debita. No puede
 * cubrir más de lo que falta pagar (`validarChequeNuevo`, adentro de la transacción del alta).
 */
export async function agregarCheque(
  _prev: EstadoFormularioCuenta,
  formData: FormData,
): Promise<EstadoFormularioCuenta> {
  try {
    // Quién lo cargó queda en la auditoría (`auditAdmin` lo toma de la sesión).
    await requireAppAccion("cuentas-a-pagar");
    const tenantId = await getCurrentTenantId();

    const id = leerTexto(formData.get("id"), 64);
    if (!id) return { estado: "error", mensaje: "No encontramos la cuenta. Recargá la pantalla y volvé a intentar." };
    const numero = leerTexto(formData.get("numero"), 40);
    if (!numero) return { estado: "error", mensaje: "Poné el número del cheque." };
    const banco = leerTexto(formData.get("banco"), 60);
    if (!banco) return { estado: "error", mensaje: "Poné el banco del cheque." };
    const fecha = leerFecha(formData.get("fecha"));
    if (!fecha) return { estado: "error", mensaje: "Poné la fecha del cheque (el día que se puede cobrar)." };
    const monto = leerMonto(formData.get("monto"));
    if (monto === null) return { estado: "error", mensaje: "Poné el monto del cheque, mayor a cero." };
    const entregado = String(formData.get("entregado") ?? "") === "1";

    // El tope (no cubrir más de lo que falta pagar), el alta y la entrega van juntos en UNA
    // transacción: la validación ve el mismo saldo y los mismos cheques que la escritura.
    const { id: chequeId, monto: montoCheque } = await addChequeToPayable(tenantId, id, {
      chequeNumber: numero,
      bank: banco,
      amount: monto,
      dueDate: fecha,
      entregado,
    });
    await auditAdmin({
      action: "create",
      entity: "PayableCheque",
      entityId: chequeId,
      changes: { cuenta: id, numero, banco, monto: montoCheque, fecha: fecha.toISOString(), entregado },
    });
    revalidarCuenta(id, false);
    return {
      estado: "ok",
      mensaje: `Cheque N° ${numero} por ${fmtMoneyARS(montoCheque)} cargado${entregado ? " como entregado" : " en la chequera"}. Cuando el banco lo debite, marcalo como debitado.`,
    };
  } catch (e) {
    unstable_rethrow(e);
    return { estado: "error", mensaje: mensajeDeRechazo(e, "cheque") };
  }
}

/**
 * El cheque cambia de estado: entregado, debitado, rebotado o anulado. Al DEBITARSE se
 * registra el pago de la deuda por el monto del cheque (y, con cuentas corrientes encendidas,
 * el egreso en el libro de hoy); rebotado o anulado no baja el saldo. La máquina de estados
 * vive en cheque.ts y la valida el servicio adentro de la transacción.
 */
export async function cambiarEstadoCheque(
  _prev: EstadoFormularioCuenta,
  formData: FormData,
): Promise<EstadoFormularioCuenta> {
  try {
    const user = await requireAppAccion("cuentas-a-pagar");
    const tenantId = await getCurrentTenantId();

    const cuentaId = leerTexto(formData.get("id"), 64);
    const chequeId = leerTexto(formData.get("chequeId"), 64);
    const a = formData.get("a");
    if (!cuentaId || !chequeId || !esEstadoDeCheque(a)) {
      return { estado: "error", mensaje: "No entendimos qué hacer con el cheque. Recargá la pantalla y volvé a intentar." };
    }
    // Con la cuenta: el cheque tiene que ser de ESTA deuda, la que se audita y se revalida.
    await transitionCheque(tenantId, chequeId, a, `user:${user.id}`, cuentaId);
    await auditAdmin({ action: "update", entity: "PayableCheque", entityId: chequeId, changes: { cuenta: cuentaId, estado: a } });
    const enLibro = a === "CLEARED" && cuentasCorrientesEnabled();
    revalidarCuenta(cuentaId, enLibro);
    const que =
      a === "CLEARED"
        ? `Cheque debitado: se registró el pago de la deuda${enLibro ? " y el egreso en el libro de caja de hoy" : ""}.`
        : `Cheque marcado como «${ETIQUETA_CHEQUE[a].toLowerCase()}».`;
    return { estado: "ok", mensaje: que };
  } catch (e) {
    unstable_rethrow(e);
    return { estado: "error", mensaje: mensajeDeRechazo(e, "cheque") };
  }
}
