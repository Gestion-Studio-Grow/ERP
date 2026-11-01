// Las apps de gestión de eventos: el buscador y los avisos son los mismos en todas las pantallas.

import type { ReactNode } from "react";
import { requireApp } from "@/lib/require-app";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { prisma } from "@/lib/prisma";
import { ROL_LABEL } from "@/lib/proyectos/gestion-core";
import { BarraGestion } from "./_barra";

export default async function LayoutGestion({ children }: { children: ReactNode }) {
  await requireApp("proyectos");
  const a = await actorActual();
  const avisos = await prisma.proyectoAviso.count({ where: { tenantId: a.tenantId, destinatario: a.user.id, leidoEl: null } });
  return (
    <div className="min-w-0" data-gestion>
      <BarraGestion avisos={avisos} persona={a.nombre} rol={ROL_LABEL[a.rol]} />
      {children}
    </div>
  );
}
