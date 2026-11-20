// Los avisos de vencimiento que no pueden depender de que alguien abra Inicio. Corre una vez por día desde el cron de
// recordatorios: sólo productoras, cada una parada en su negocio, y el error de una no frena a las demás.

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { avisarVencimientos } from "./gestion.server";
import { avisarObligaciones, hayM7b } from "./etapas-m7b.server";

export interface ResumenAvisos {
  negocios: number;
  fallas: number;
}

export async function barrerAvisosDeProyectos(): Promise<ResumenAvisos> {
  const negocios = await basePrisma.tenant.findMany({ where: { blueprintId: "productora" }, select: { id: true, slug: true }, orderBy: { id: "asc" } });
  const dominio = process.env.APP_BASE_DOMAIN?.trim();
  let fallas = 0;
  // MIA-50 T09 · O07: las obligaciones a mano, sólo con M7b (se mira antes de abrir la transacción).
  const conObligaciones = await hayM7b(basePrisma);
  const hoy = new Date();
  for (const n of negocios) {
    try {
      const origen = dominio ? `https://${n.slug}.${dominio}` : null;
      await tenantTransaction(async (tx) => {
        await avisarVencimientos(tx, n.id, origen);
        if (conObligaciones) await avisarObligaciones(tx, n.id, hoy, origen);
      }, { tenantId: n.id });
    } catch {
      fallas++;
      console.error(`[proyectos/avisos] falló el barrido del negocio ${n.id}`);
    }
  }
  return { negocios: negocios.length, fallas };
}
