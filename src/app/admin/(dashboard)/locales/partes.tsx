// Piezas compartidas de las pantallas de Mis locales (server components, sin estado).
//
// Las pantallas leen lo mismo (la red de la casa) y tienen los mismos finales posibles además
// del normal: el negocio no es la casa de una red, la red todavía no tiene locales, la base no
// se pudo leer, o UN local no se pudo leer (los demás se muestran igual). Todos dicen qué pasó
// y cómo seguir: ninguno cae en la pantalla genérica de error.

import Link from "next/link";
import { AvisoError, EmptyState, buttonClasses, chipLinkAtributos, cn } from "@/components/ui";
import { formatDayLabel } from "@/lib/caja/cierre-diario";
import { mapaDeHostsVigente } from "@/lib/tenant";
import type { Role } from "@/lib/capabilities";
import type { LocalSinLeer } from "@/lib/multilocal/multilocal-actions";
import { appPorId } from "@/apps/registro";
import { appPermitida } from "@/apps/visibles";
import { getNegocioApps } from "@/apps/contexto.server";

/** Cómo se llega al backoffice de cada negocio en este deploy (lo usa `direccionDelLocal`). */
export function ruteoDeLocales() {
  return {
    mapaDeHosts: mapaDeHostsVigente(),
    dominioPropio: process.env.APP_BASE_DOMAIN?.trim() || null,
  };
}

type Solapa =
  | "mis-locales"
  | "ventas-por-local"
  | "cajas-de-los-locales"
  | "stock-por-local"
  | "catalogo-de-la-marca"
  | "traslados";

const SOLAPAS: { id: Solapa; href: string; etiqueta: string }[] = [
  { id: "mis-locales", href: "/admin/locales", etiqueta: "Hoy" },
  { id: "ventas-por-local", href: "/admin/locales/ventas", etiqueta: "Ventas" },
  { id: "cajas-de-los-locales", href: "/admin/locales/cajas", etiqueta: "Cajas" },
  { id: "stock-por-local", href: "/admin/locales/stock", etiqueta: "Stock" },
  { id: "traslados", href: "/admin/locales/traslados", etiqueta: "Traslados" },
  { id: "catalogo-de-la-marca", href: "/admin/locales/catalogo", etiqueta: "Catálogo y precios" },
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
        <Link key={s.id} href={s.href} {...chipLinkAtributos(s.id === activa)}>
          {s.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

/**
 * El negocio no es la casa de una red (o tiene los dos paneles a la vez), o no se pudo comprobar
 * (la base no contestó): son dos cosas distintas y el título no puede decir lo mismo.
 */
export function NoEsCasa({ error, noSeLeyo }: { error: string; noSeLeyo?: boolean }) {
  return (
    <AvisoError
      titulo={noSeLeyo ? "No se pudo abrir Mis locales en este momento" : "Mis locales no está disponible en este negocio"}
      comoSeguir={error}
      accion={
        <Link href="/admin" className={buttonClasses("outline", "md")}>
          Ir al inicio
        </Link>
      }
    />
  );
}

/**
 * La lectura de la red entera falló (la base no contestó, o falta una migración): la pantalla dice
 * qué pasó y cómo seguir. Si falla UN local, no se usa esto sino `LocalesSinLeer`.
 */
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

/**
 * Los locales que no se pudieron leer en esta pasada. Los demás se muestran igual; acá se dice
 * cuál falta, qué pasó y cómo seguir. `ruta` es la misma pantalla, para reintentar.
 */
export function LocalesSinLeer({ sinLeer, ruta, className }: { sinLeer: readonly LocalSinLeer[]; ruta: string; className?: string }) {
  if (sinLeer.length === 0) return null;
  return (
    <div className={cn("mb-lg space-y-2", className)}>
      {sinLeer.map((l) => (
        <AvisoError
          key={l.localTenantId}
          tono="aviso"
          titulo={`No se pudo leer ${l.alias}: lo que ves abajo es sin ese local`}
          comoSeguir={l.motivo}
          accion={
            <Link href={ruta} className={buttonClasses("outline", "md")}>
              Probar de nuevo
            </Link>
          }
        />
      ))}
    </div>
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
