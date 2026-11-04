import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { isDemoSandbox } from "@/lib/demo-flag";
import { brandForSlug, resolveAccent } from "@/lib/branding";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { PageHeader } from "@/components/ui";
import { marcaDeLaPlaca } from "@/lib/contenido/marca";
import { listarPublicaciones } from "@/lib/contenido/almacen.server";
import { ContenidoCliente } from "./ContenidoCliente";
import { hoyEnArgentina, slugDelAlmacen } from "./fechas";

export const dynamic = "force-dynamic";

/**
 * Contenido: el negocio escribe lo que quiere contar, elige una de tres placas con SU marca y la agenda
 * (docs/producto/contenido/PLAN.md §3). Si la tabla `PublicacionAgendada` todavía no está en la base (Gate 2), la
 * agenda vive en este equipo (modo demo, almacén local por negocio) y la pantalla lo avisa.
 */
export default async function ContenidoPage() {
  // La guardia de la app (rol con clients:read + módulo `contenido`), como campanias.
  const user = await requireApp("contenido");
  const tenantId = user.tenantId;

  const slug = await getCurrentTenantSlug().catch(() => null);
  const brand = brandForSlug(slug);
  // Los datos del negocio son opcionales para la placa: si no se pueden leer, la placa va sin WhatsApp ni Instagram.
  // En la demo sin base (DEMO_MODE_ENABLED) no se toca Prisma: todo va al almacén local.
  const sandbox = isDemoSandbox();
  const ajustes = sandbox
    ? null
    : await prisma.businessSettings
        .findUnique({ where: { tenantId }, select: { whatsapp: true, instagram: true } })
        .catch(() => null);
  const marca = marcaDeLaPlaca(brand, ajustes, resolveAccent(brand.preset, "light"));

  const agenda = sandbox ? ({ estado: "sin-tabla" } as const) : await listarPublicaciones(prisma, tenantId);

  return (
    <main data-ui="pagina" className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Contenido"
        description="Escribí lo que querés contar: te proponemos tres placas con tu marca, el texto para Instagram y WhatsApp, y lo agendás para el día que va."
      />
      <ContenidoCliente
        marca={marca}
        hoy={hoyEnArgentina()}
        slug={slugDelAlmacen(slug, tenantId)}
        inicial={agenda.estado === "ok" ? { modo: "base", publicaciones: agenda.valor } : { modo: "demo" }}
      />
    </main>
  );
}
