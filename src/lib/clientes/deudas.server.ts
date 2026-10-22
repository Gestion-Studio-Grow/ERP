// ============================================================================
// LO QUE DEBE CADA CLIENTA — para la vista «Deben» de Clientes (reingeniería CH, Tanda 2). Servidor.
// ============================================================================
//
// Σ saldo de los turnos YA PRESTADOS (COMPLETED) con plata pendiente, con la MISMA regla que
// «Saldos a cobrar» de la lista y el «Debe $X» del alta (`esCuentaACobrar` sobre `estadoCobroTurno`,
// a través de `deudaDe` de buscar-core.ts). Mira la misma ventana que el resto de la lista de
// clientas (`desde`, el historial del CRM): una deuda más vieja se ve en la ficha.
//
// Dos lecturas, las dos con el predicado `tenantId` además de RLS: los turnos completados (campo
// por campo) y sus cobros (`cobrosDetalladosPorTurno`). Sólo lectura.

import "server-only";
import { prisma } from "@/lib/prisma";
import { cobrosDetalladosPorTurno } from "@/lib/turnos/anulacion";
import { deudaDe, type CompletadoLeido } from "./buscar-core";

export async function deudasDelNegocio(tenantId: string, desde: Date): Promise<Map<string, number>> {
  const filas = await prisma.appointment.findMany({
    where: { tenantId, status: "COMPLETED", startsAt: { gte: desde } },
    select: { id: true, clientId: true, startsAt: true, priceAtBooking: true, service: { select: { price: true } }, payment: { select: { status: true, amount: true } } },
  });
  if (filas.length === 0) return new Map();
  const cobros = await cobrosDetalladosPorTurno(
    prisma,
    tenantId,
    filas.map((f) => f.id),
  );
  const porClienta = new Map<string, CompletadoLeido[]>();
  for (const f of filas) {
    if (!f.clientId) continue;
    const lista = porClienta.get(f.clientId) ?? [];
    lista.push({ id: f.id, clienteId: f.clientId, inicio: f.startsAt, precio: f.priceAtBooking ?? f.service.price, pagoLegado: f.payment });
    porClienta.set(f.clientId, lista);
  }
  const plano = new Map([...cobros].map(([id, cs]) => [id, cs.map((c) => ({ amount: c.amount, method: c.method }))]));
  const deudas = new Map<string, number>();
  for (const [id, turnos] of porClienta) {
    const d = deudaDe(turnos, plano).monto;
    if (d > 0) deudas.set(id, d);
  }
  return deudas;
}
