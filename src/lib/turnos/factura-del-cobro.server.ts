// Opción B de CH (decisión del dueño, 06/11/2026): la factura de un cobro sale AL COBRARLO.
// La llaman las acciones que registran plata de un turno (la seña al reservar, «Llegó la seña»,
// «Registrar cobro», «+ Sumar lo que debe»). Al terminar el turno factura `facturarAppointment`, que
// con la opción B también factura cobro por cobro.
//
// Best-effort, como la factura al terminar (ADR-024 §2.a): nunca tira y el cobro queda registrado
// igual; si la factura no sale, devuelve el aviso para recepción. Detrás de `isInvoicingEnabled()`.

import { isInvoicingEnabled } from "@/lib/fiscal";
import { facturarAppointment } from "@/lib/invoice-from-appointment";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { avisoDeFacturaDelTurno, type ResultadoFacturaDelTurno } from "./aviso-factura";
import { resultadoDeFacturaFallida } from "./factura-fallida.server";

/** Lo que se eligió al terminar el turno: «No facturar» vale también para el saldo que entre después. */
export function eligioNoFacturar(changes: unknown): boolean {
  return (changes as { facturar?: unknown } | null)?.facturar === false;
}

async function noFacturarDespuesDeTerminar(tenantId: string, appointmentId: string): Promise<boolean> {
  return tenantTransaction(
    async (tx) => {
      const turno = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId }, select: { status: true } });
      if (!turno) return true;
      if (turno.status !== "COMPLETED") return false;
      const alTerminar = await tx.auditLog.findFirst({
        where: { tenantId, entity: "Appointment", entityId: appointmentId, action: "complete" },
        orderBy: { createdAt: "desc" },
        select: { changes: true },
      });
      return eligioNoFacturar(alTerminar?.changes ?? null);
    },
    { tenantId },
  );
}

/** Factura los cobros del turno que todavía no tienen factura y devuelve el aviso (o `null`). */
export async function facturarDespuesDelCobro(appointmentId: string, tenantId: string): Promise<string | null> {
  if (!isInvoicingEnabled()) return null;
  let r: ResultadoFacturaDelTurno;
  try {
    if (await noFacturarDespuesDeTerminar(tenantId, appointmentId)) return null;
    const invoiceId = await facturarAppointment(appointmentId, tenantId, undefined, { soloCobros: true });
    if (!invoiceId) return null;
    const factura = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, select: { status: true, rechazoMotivo: true } });
    r = factura ? { tipo: "emitida", status: factura.status, rechazoMotivo: factura.rechazoMotivo } : { tipo: "fallo" };
  } catch (err) {
    r = await resultadoDeFacturaFallida(err, { appointmentId, tenantId });
  }
  return avisoDeFacturaDelTurno(r, "cobro");
}
