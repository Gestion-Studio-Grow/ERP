// AVISO DE LA CUADRILLA (GSG-MIA-062): una franja arriba del panel, sólo en los negocios que tienen agentes.
//
// · A la dueña (supervisión): «N esperan tu decisión · Abrir la primera» → /admin/cuadrilla con la más vieja
//   ya abierta y a la vista (ancla `#decision`, como la bandeja: Aprobar y Rechazar sin desplazar a 390 y a 1280,
//   C2 de GSG-MIA-076, GSG-MIA-078). De entrar al panel a ver la primera excepción: un toque, en la PC y en el celular.
// · Al usuario de un agente: el enlace a su hilo.
// · A cualquier otro, o si el negocio no tiene cuadrilla (o falta la migración): nada, ni un nodo.
// Una transacción chica bajo RLS por carga del armazón; si falla, no se dibuja y el panel sigue.
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { tenantTransaction } from "@/lib/rls";
import { agenteDelUsuario, resumenDePendientes } from "@/lib/cuadrilla/consola-core";

type Estado = { tipo: "agente" } | { tipo: "supervisor"; pendientes: number; primeraId: string | null } | null;

async function leer(): Promise<Estado> {
  const user = await getCurrentUser();
  if (!user) return null;
  const tenantId = user.tenantId;
  try {
    return await tenantTransaction(
      async (tx) => {
        if (await agenteDelUsuario(tx, tenantId, user.id)) return { tipo: "agente" } as const;
        if (user.role !== "OWNER") return null;
        const agentes = await tx.agenteCuadrilla.count({ where: { tenantId } });
        if (agentes === 0) return null;
        return { tipo: "supervisor" as const, ...(await resumenDePendientes(tx, tenantId)) };
      },
      { tenantId },
    );
  } catch {
    return null; // sin la migración (P2021) o sin base: el panel sigue igual
  }
}

export default async function AvisoDeLaCuadrilla() {
  const estado = await leer();
  if (!estado) return null;
  const clase = "flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm";
  if (estado.tipo === "agente") {
    return (
      <div className={`${clase} border-line bg-surface-sunken text-body`}>
        <span>Sos un usuario de agente.</span>
        <Link href="/admin/cuadrilla" className="font-medium text-accent underline">
          Ir a mi hilo
        </Link>
      </div>
    );
  }
  const hay = estado.pendientes > 0;
  return (
    <div role={hay ? "status" : undefined} className={`${clase} ${hay ? "border-warning bg-warning-soft text-warning" : "border-line bg-surface-sunken text-muted"}`}>
      <span>
        Cuadrilla: {hay ? `${estado.pendientes} ${estado.pendientes === 1 ? "espera" : "esperan"} tu decisión` : "nada espera tu decisión"}
      </span>
      <Link href={hay && estado.primeraId ? `/admin/cuadrilla?ex=${estado.primeraId}#decision` : "/admin/cuadrilla"} className="font-medium underline">
        {hay ? "Abrir la primera" : "Ver la cuadrilla"}
      </Link>
    </div>
  );
}
