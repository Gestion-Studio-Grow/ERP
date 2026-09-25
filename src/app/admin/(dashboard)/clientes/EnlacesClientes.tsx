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
import { chipLinkAtributos } from "@/components/ui";

const ATAJOS: { id: AppId; etiqueta: string }[] = [
  { id: "clientes", etiqueta: "Todos" },
  { id: "para-contactar-hoy", etiqueta: "Para contactar hoy" },
  { id: "clientas-por-recuperar", etiqueta: "Por recuperar" },
  { id: "unificar-fichas", etiqueta: "Fichas duplicadas" },
];

/** Los atajos que esta persona puede abrir (el «⋯» de la lista los ofrece en el celular). */
export async function atajosDeClientes(role: Role): Promise<{ id: AppId; etiqueta: string; href: string }[]> {
  const negocio = await getNegocioApps(role);
  const visibles = ATAJOS.filter((a) => appPermitida(appPorId(a.id), negocio));
  return visibles.length < 2 ? [] : visibles.map((a) => ({ ...a, href: appPorId(a.id).ruta }));
}

export default async function EnlacesClientes({
  role,
  actual,
  className = "mb-6 flex flex-wrap gap-2",
}: {
  role: Role;
  actual: AppId;
  className?: string;
}) {
  const visibles = await atajosDeClientes(role);
  if (visibles.length === 0) return null;
  return (
    <nav aria-label="Apps de clientes" className={className}>
      {visibles.map((a) => {
        const activo = a.id === actual;
        return (
          <Link key={a.id} href={a.href} {...chipLinkAtributos(activo, "shrink-0")}>
            {a.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
