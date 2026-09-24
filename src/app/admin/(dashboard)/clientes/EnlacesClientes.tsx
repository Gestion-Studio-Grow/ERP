// Los atajos entre las apps de Clientes (la lista, la bandeja, por recuperar, duplicadas). Sólo
// se ofrecen las que esta persona puede ABRIR, con la misma regla que la guardia de cada página
// (`appPermitida`): un atajo que termina en "App no disponible" sería un callejón.
//
// Componente de servidor. Lo usan sólo las pantallas del Inicio por apps: en CH (fuera del
// piloto) la pantalla de Clientes sigue siendo la de siempre, sin atajos nuevos.

import Link from "next/link";
import { appPermitida } from "@/apps/visibles";
import { appPorId, type AppId } from "@/apps/registro";
import { getNegocioApps } from "@/apps/contexto.server";
import type { Role } from "@/lib/capabilities";
import { cn } from "@/components/ui";

const ATAJOS: { id: AppId; etiqueta: string }[] = [
  { id: "clientes", etiqueta: "Todos" },
  { id: "para-contactar-hoy", etiqueta: "Para contactar hoy" },
  { id: "clientas-por-recuperar", etiqueta: "Por recuperar" },
  { id: "unificar-fichas", etiqueta: "Fichas duplicadas" },
];

export default async function EnlacesClientes({ role, actual }: { role: Role; actual: AppId }) {
  const negocio = await getNegocioApps(role);
  const visibles = ATAJOS.filter((a) => appPermitida(appPorId(a.id), negocio));
  if (visibles.length < 2) return null;
  return (
    <nav aria-label="Apps de clientes" className="mb-6 flex flex-wrap gap-2">
      {visibles.map((a) => {
        const activo = a.id === actual;
        return (
          <Link
            key={a.id}
            href={appPorId(a.id).ruta}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
              activo
                ? "border-accent bg-accent-soft text-accent-ink"
                : "border-line bg-surface-raised text-body hover:border-line-strong",
            )}
          >
            {a.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
