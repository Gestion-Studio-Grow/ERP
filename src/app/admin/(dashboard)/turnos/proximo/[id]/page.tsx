import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { cicloPersonal, type VisitaCiclo } from "@/lib/crm/ciclo";
import { fechaDelProximo, hrefDelProximo } from "@/lib/turnos/practica";

export const dynamic = "force-dynamic";

// «RESERVAR EL PRÓXIMO» (agenda práctica, E5): desde un turno completado abre el alta con la misma
// clienta y la fecha de su ciclo (cada cuánto vuelve según sus visitas; si es nueva, el ciclo por
// defecto del CRM, provisional). Es una ruta y no un cálculo en la fila porque la fila no tiene el
// historial de la clienta: acá se lee una vez, al tocar el botón.
export default async function ReservarElProximo({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("agenda");
  await requireCapability("agenda:manage");
  const { id } = await params;
  const tenantId = await getCurrentTenantId();
  const turno = await prisma.appointment.findFirst({ where: { id, tenantId }, select: { clientId: true, startsAt: true } });
  if (!turno) redirect("/admin/turnos/lista");

  const filas = await prisma.appointment.findMany({
    where: { tenantId, clientId: turno.clientId, status: "COMPLETED" },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, serviceId: true },
    take: 200,
  });
  // Dos turnos el mismo día son UNA visita (ciclo.ts).
  const visitas: VisitaCiclo[] = [];
  for (const f of filas) {
    const fecha = dateStrInBusinessTz(f.startsAt);
    if (visitas.at(-1)?.fecha !== fecha) visitas.push({ fecha, servicioId: f.serviceId });
  }
  const ciclo = cicloPersonal(visitas, new Map());
  const fecha = fechaDelProximo({ dia: dateStrInBusinessTz(turno.startsAt), cicloDias: ciclo.dias, hoy: todayInBusinessTz() });
  redirect(hrefDelProximo({ clienteId: turno.clientId, fecha }));
}
