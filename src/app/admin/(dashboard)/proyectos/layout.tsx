// Las apps de gestión de eventos: la barra lateral, el buscador y los avisos son los mismos en todas las pantallas.

import type { ReactNode } from "react";
import { requireApp } from "@/lib/require-app";
import { actorActual, puede } from "@/lib/proyectos/gestion.server";
import { prisma } from "@/lib/prisma";
import { BarraGestion } from "./_barra";
import { ROL_LABEL } from "@/lib/proyectos/gestion-core";

export default async function LayoutGestion({ children }: { children: ReactNode }) {
  await requireApp("proyectos");
  const a = await actorActual();
  const avisos = await prisma.proyectoAviso.count({ where: { tenantId: a.tenantId, destinatario: a.user.id, leidoEl: null } });
  const permitidas = {
    empresa: puede(a, "empresa", "ver") || puede(a, "liquidaciones", "ver"),
    direccion: puede(a, "direccion", "ver"),
    equipo: puede(a, "equipo", "ver"),
    proveedores: puede(a, "proveedores", "ver"),
    diseno: puede(a, "diseno", "ver"),
    ia: puede(a, "ia", "ver"),
  };
  return (
    <div className="mx-auto w-full max-w-[1500px] lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
      <BarraGestion permitidas={permitidas} avisos={avisos} persona={a.nombre} rol={ROL_LABEL[a.rol]} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
