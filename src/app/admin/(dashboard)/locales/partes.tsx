// Piezas compartidas de las pantallas de Mis locales (server components, sin estado).
//
// Las cuatro pantallas leen lo mismo (la red de la casa) y tienen los mismos tres finales
// posibles además del normal: el negocio no es la casa de una red, la red todavía no tiene
// locales, o la base no se pudo leer. Los tres dicen qué pasó y cómo seguir.

import Link from "next/link";
import { AvisoError, EmptyState, buttonClasses, cn } from "@/components/ui";
import { formatDayLabel } from "@/lib/caja/cierre-diario";
import { parseTenantHostMap } from "@/lib/tenant";
import type { Role } from "@/lib/capabilities";
import { appPorId } from "@/apps/registro";
import { appPermitida } from "@/apps/visibles";
import { getNegocioApps } from "@/apps/contexto.server";

/** Cómo se llega al backoffice de cada negocio en este deploy (lo usa `direccionDelLocal`). */
export function ruteoDeLocales() {
  return {
    mapaDeHosts: parseTenantHostMap(process.env.TENANT_HOST_MAP),
    dominioPropio: process.env.APP_BASE_DOMAIN?.trim() || null,
  };
}

type Solapa = "mis-locales" | "ventas-por-local" | "cajas-de-los-locales" | "stock-por-local";

const SOLAPAS: { id: Solapa; href: string; etiqueta: string }[] = [
  { id: "mis-locales", href: "/admin/locales", etiqueta: "Hoy" },
  { id: "ventas-por-local", href: "/admin/locales/ventas", etiqueta: "Ventas" },
  { id: "cajas-de-los-locales", href: "/admin/locales/cajas", etiqueta: "Cajas" },
  { id: "stock-por-local", href: "/admin/locales/stock", etiqueta: "Stock" },
];

/**
 * Las vistas de la red que ESTA persona puede abrir, una al lado de la otra. Se decide con la
 * misma regla que la guardia de cada página (`appPermitida`): el encargado ve sólo Stock, y en
 * una red que no es de mostrador Stock no aparece. Una solapa que rebota sería un callejón.
 */
export async function SolapasLocales({ activa, role }: { activa: Solapa; role: Role }) {
  const negocio = await getNegocioApps(role);
  const visibles = SOLAPAS.filter((s) => appPermitida(appPorId(s.id), negocio));
  if (visibles.length < 2) return null;
  return (
    <nav aria-label="Vistas de Mis locales" className="mb-lg flex flex-wrap gap-2">
      {visibles.map((s) => (
        <Link
          key={s.id}
          href={s.href}
          aria-current={s.id === activa ? "page" : undefined}
          className={buttonClasses(s.id === activa ? "solid" : "outline", "md")}
        >
          {s.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

/** El negocio no es la casa de una red (o tiene los dos paneles a la vez). */
export function NoEsCasa({ error }: { error: string }) {
  return (
    <AvisoError
      titulo="Mis locales no está disponible en este negocio"
      comoSeguir={error}
      accion={
        <Link href="/admin" className={buttonClasses("outline", "md")}>
          Ir al inicio
        </Link>
      }
    />
  );
}

/** La lectura falló de una forma que la pantalla puede explicar (hoy: migración pendiente). */
export function NoSePudoLeer({ error }: { error: string }) {
  return (
    <AvisoError
      titulo="No se pudo leer la red de locales"
      comoSeguir={error}
      accion={
        <Link href="/admin" className={buttonClasses("outline", "md")}>
          Ir al inicio
        </Link>
      }
    />
  );
}

/** La casa todavía no tiene locales vinculados. Lo único que puede hacer es pedirlo. */
export function SinLocales() {
  return (
    <EmptyState
      title="Todavía no hay locales vinculados"
      description={
        "Cada local es un negocio propio en el sistema, con su caja y su stock. Para verlos acá, " +
        "Gestión Studio Grow los vincula a tu casa desde su consola: pasale el nombre de cada local."
      }
      action={
        <Link href="/admin" className={buttonClasses("outline", "md")}>
          Volver al inicio
        </Link>
      }
    />
  );
}

/** "21/09/2026", el día del negocio como lo lee la persona. */
export const dia = formatDayLabel;

/** Link al backoffice de un local, o el porqué de que no haya. */
export function AbrirLocal({ url, etiqueta, className }: { url: string | null; etiqueta: string; className?: string }) {
  if (!url) {
    return (
      <p className={cn("text-xs text-muted", className)}>
        Este local no tiene una dirección cargada: entrá con su usuario desde su propio link.
      </p>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md", className)}>
      {etiqueta}
      <span className="sr-only"> (se abre en otra pestaña; pide el usuario de ese local)</span>
    </a>
  );
}
