// Los servicios que ofrece el campo único de Vender (interruptor `agenda-interaccion`): los activos
// del negocio que hace al menos una profesional activa (uno sin quien lo haga no tiene huecos).
// Una consulta, sólo con el interruptor prendido; `tenantId` explícito además de RLS.
import "server-only";
import { prisma } from "@/lib/prisma";
import type { ServicioDelBuscador } from "@/app/admin/(dashboard)/pedidos/buscar-turnos/buscar-turnos-core";

export async function serviciosDelBuscador(tenantId: string): Promise<ServicioDelBuscador[]> {
  const filas = await prisma.service.findMany({
    where: { tenantId, active: true, deletedAt: null, professionals: { some: { tenantId, active: true, deletedAt: null } } },
    select: { id: true, name: true, durationMin: true, price: true },
    orderBy: { name: "asc" },
  });
  return filas.map((s) => ({ id: s.id, nombre: s.name, durationMin: s.durationMin, precio: Number(s.price) }));
}
