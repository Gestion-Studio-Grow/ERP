// EVENTOS Y SPONSORS · piezas compartidas de las pantallas (GSG-CRM-009).
//
// Guardia de TODAS las páginas: `requireApp("eventos-sponsors")` al tope (rol y panel del negocio) y
// después `abrirEventos(user)`: el interruptor «eventos-sponsors» del negocio (apagado → 404: para ese
// negocio no existe) + el rol de gestión (Diseño o Producción no lo abren por URL) + el tenantId del request. Va en cada página, nunca en un layout (src/lib/require-app.ts).

import "server-only";
import { notFound } from "next/navigation";
import type { SessionUser } from "@/lib/session";
import { getCurrentTenantId } from "@/lib/tenant";
import { permisoFueraDeLaAgenda } from "@/lib/capabilities";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { eventosSponsorsPrendido } from "@/cambios/interruptores";
import { rolDeGestionPermiteEventos } from "@/lib/eventos-sponsors/acceso.server";
import { AvisoError, Badge, PageHeader, Pestanas, type BadgeTone } from "@/components/ui";
import { ETIQUETA_PUESTO, ETIQUETA_ROL, ETIQUETA_VERIFICACION, type Puesto, type Rol, type Verificacion } from "@/lib/eventos-sponsors/core";
import type { LineaDeRegistro } from "@/lib/eventos-sponsors/repo";

export const TITULO = "Eventos y sponsors";

export async function abrirEventos(user: SessionUser) {
  if (!eventosSponsorsPrendido(await interruptoresDelNegocio())) notFound();
  if (!(await rolDeGestionPermiteEventos(user))) notFound();
  return { user, tenantId: await getCurrentTenantId(), puedeCargar: permisoFueraDeLaAgenda(user, "clients:manage") };
}

export function Encabezado({ vista, puedeCargar, descripcion }: { vista: "equipo" | "eventos" | "marcas" | "importar"; puedeCargar: boolean; descripcion?: string }) {
  const pestanas = [
    { href: "/admin/eventos/equipo", etiqueta: "Equipo", actual: vista === "equipo" },
    { href: "/admin/eventos", etiqueta: "Eventos", actual: vista === "eventos" },
    { href: "/admin/eventos/marcas", etiqueta: "Marcas", actual: vista === "marcas" },
    ...(puedeCargar ? [{ href: "/admin/eventos/importar", etiqueta: "Cargar resultados", actual: vista === "importar" }] : []),
  ];
  return (
    <>
      <PageHeader title={TITULO} description={descripcion ?? "Lo que relevó el equipo de agentes: los eventos de cada región y las marcas que van a cada uno, con el link a la fuente."} />
      <Pestanas pestanas={pestanas} etiqueta="Vistas de eventos y sponsors" conRaya className="mb-6" />
    </>
  );
}

export function FaltaMigracion() {
  return (
    <AvisoError
      tono="aviso"
      titulo="Falta un paso de base de datos"
      comoSeguir="El módulo está activado pero su tabla todavía no está creada en este negocio. Avisale a GSG: es un paso de una sola vez."
    />
  );
}

/** Link a la fuente: abre en otra pestaña, sin pasarle al sitio de dónde venimos. */
export function LinkFuente({ url, children = "Ver fuente" }: { url: string; children?: React.ReactNode }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2" title={url}>
      {children} <span className="text-muted">({host})</span>
    </a>
  );
}

export function etiquetaRol(rol: string): string {
  return ETIQUETA_ROL[rol as Rol] ?? rol;
}

const TONO_VERIFICACION: Record<Verificacion, BadgeTone> = { confirmado: "success", "en duda": "warning", falla: "danger", "sin verificar": "neutral" };

/** Lo que dijo el Verificador. «Sin verificar» también se muestra: no es lo mismo que confirmado. */
export function SelloVerificacion({ v }: { v: string }) {
  const k = (v in TONO_VERIFICACION ? v : "sin verificar") as Verificacion;
  return <Badge tone={TONO_VERIFICACION[k]}>{ETIQUETA_VERIFICACION[k]}</Badge>;
}

/** «edición 2027» o «estuvo en la edición 2025 (la pasada)»: un sponsor de la edición pasada no es un confirmado de la próxima. */
export function etiquetaEdicion(edicion: string | null): string | null {
  if (!edicion) return null;
  const pasada = /^anterior\s*\(([^)]+)\)$/i.exec(edicion.trim());
  return pasada ? `estuvo en la edición ${pasada[1]} (la pasada)` : `edición ${edicion}`;
}

export function etiquetaPuesto(p: string): string {
  return ETIQUETA_PUESTO[p as Puesto] ?? p;
}

const HORA = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

/** Qué hizo el equipo con este dato: una línea por paso, con su fuente. Plegado para no tapar la lista. */
export function Registro({ lineas, titulo = "Qué hizo el equipo" }: { lineas: readonly LineaDeRegistro[]; titulo?: string }) {
  if (lineas.length === 0) return null;
  return (
    <details className="mt-1 text-sm">
      <summary className="cursor-pointer text-muted underline-offset-2 hover:underline">
        {titulo} ({lineas.length})
      </summary>
      <ol className="mt-2 grid gap-1.5 border-l border-line pl-3">
        {lineas.map((l, i) => (
          <li key={i} className="min-w-0">
            <span className="font-medium text-strong">{etiquetaPuesto(l.puesto)}</span>
            <span className="text-muted"> · {HORA.format(l.hora)} · </span>
            {l.accion}
            {l.detalle && <span className="block break-words text-muted">{l.detalle}</span>}
            {l.url && <span className="block"><LinkFuente url={l.url} /></span>}
          </li>
        ))}
      </ol>
    </details>
  );
}
