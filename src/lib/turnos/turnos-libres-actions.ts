"use server";

// VENDER · «Turnos libres» de un servicio (interruptor `agenda-interaccion`). UNA consulta por
// búsqueda: el navegador manda el servicio y recibe los huecos de TODAS las profesionales que lo
// hacen, de hoy y los próximos días, sin cascadas del lado del cliente.
//
// Los huecos son los del motor de siempre (`getAvailableSlotsRange`: horarios, turnos, bloqueos,
// recursos y «no ofrecer lo que ya empezó»), el mismo que usa «Dar turno». Acá no se calcula nada.
//
// Guardas: la sesión (`agenda:read` para ver; `agenda:manage` decide si hay tecla para dar el
// turno), el negocio de la sesión (`tenantId` explícito en la consulta del servicio, además de RLS)
// y el interruptor prendido en ESTE negocio. Un servicio de otro negocio contesta vacío.

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { getAvailableSlotsRange } from "@/lib/actions";
import { todayInBusinessTz } from "@/lib/datetime";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { agendaInteraccionPrendida } from "@/cambios/interruptores";
import { diasParaElegir } from "@/app/admin/(dashboard)/turnos/_agenda/alta-core";
import { DIAS_A_MIRAR, type TurnosLibres } from "@/app/admin/(dashboard)/pedidos/buscar-turnos/buscar-turnos-core";

export async function turnosLibresDelServicio(servicioId: string): Promise<TurnosLibres> {
  const user = await requireUser();
  if (!roleHasCapability(user.role, "agenda:read")) return { ok: false, error: "Tu usuario no ve la agenda." };
  if (typeof servicioId !== "string" || !servicioId) return { ok: false, error: "Falta el servicio." };
  const [tenantId, interruptores] = await Promise.all([getCurrentTenantId(), interruptoresDelNegocio()]);
  if (!agendaInteraccionPrendida(interruptores)) return { ok: false, error: "Esta búsqueda no está prendida en tu negocio." };

  const servicio = await prisma.service.findFirst({
    where: { id: servicioId, tenantId, active: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      professionals: {
        where: { tenantId, active: true, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!servicio) return { ok: false, error: "Ese servicio ya no está en el catálogo." };

  const dias = diasParaElegir(todayInBusinessTz(), DIAS_A_MIRAR);
  const profesionales = await Promise.all(
    servicio.professionals.map(async (p) => {
      let huecos: Record<string, string[]>;
      try {
        huecos = await getAvailableSlotsRange(p.id, servicio.id, dias);
      } catch {
        // Una profesional sin datos completos (sin horario cargado) no tira la búsqueda entera.
        huecos = Object.fromEntries(dias.map((d) => [d, []]));
      }
      return { id: p.id, nombre: p.name, huecos };
    }),
  );
  return {
    ok: true,
    servicio: { id: servicio.id, nombre: servicio.name },
    dias,
    profesionales,
    puedeDarTurno: roleHasCapability(user.role, "agenda:manage"),
  };
}
