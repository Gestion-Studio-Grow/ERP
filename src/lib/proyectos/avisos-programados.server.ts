// Los avisos de vencimiento que no pueden depender de que alguien abra Inicio. Corre una vez por día desde el cron de
// recordatorios: sólo productoras, cada una parada en su negocio, y el error de una no frena a las demás.

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { avisarVencimientos } from "./gestion.server";

export interface ResumenAvisos {
  negocios: number;
  fallas: number;
}

export async function barrerAvisosDeProyectos(): Promise<ResumenAvisos> {
  const negocios = await basePrisma.tenant.findMany({ where: { blueprintId: "productora" }, select: { id: true, slug: true }, orderBy: { id: "asc" } });
  const dominio = process.env.APP_BASE_DOMAIN?.trim();
  let fallas = 0;
  for (const n of negocios) {
    try {
      await tenantTransaction((tx) => avisarVencimientos(tx, n.id, dominio ? `https://${n.slug}.${dominio}` : null), { tenantId: n.id });
    } catch {
      fallas++;
      console.error(`[proyectos/avisos] falló el barrido del negocio ${n.id}`);
    }
  }
  return { negocios: negocios.length, fallas };
}
