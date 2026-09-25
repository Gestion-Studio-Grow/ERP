import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { fmtDateTime, todayInBusinessTz } from "@/lib/datetime";
import { cargarEstadoEtiquetas, cargarProductosParaPrecios } from "@/lib/catalogo/precios-lectura";
import { gondolaDe, precioDeVenta } from "@/lib/catalogo/aumento-core";
import { EmptyState, PageHeader, buttonClasses, fmtNumberAR } from "@/components/ui";
import { pendientesEnLaLista } from "@/apps/kpis/precios.server";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import Etiquetas, { type ProductoEtiqueta } from "./Etiquetas";

export const dynamic = "force-dynamic";

// ETIQUETAS DE PRECIO. Arranca con lo que hay que reimprimir: los productos cuyo precio cambió
// después de su última etiqueta impresa (precios-auditoria.ts). El número de arriba es el
// mismo que el del botón del Inicio: la misma consulta de auditoría y la misma cuenta
// (`pendientesEnLaLista`, src/apps/kpis/precios.server.ts).
export default async function EtiquetasPage() {
  await requireApp("etiquetas-de-precio");
  const tenantId = await getCurrentTenantId();
  const [productos, estado, rubro, tenant] = await Promise.all([
    cargarProductosParaPrecios(tenantId),
    cargarEstadoEtiquetas(tenantId),
    getCurrentTenantRubro(),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);
  const uno = rubro.rubro?.wording.itemNoun?.trim() || "producto";
  const varios = uno.endsWith("s") ? uno : `${uno}s`;

  // Sólo lo que tiene precio lleva etiqueta.
  const conPrecio: ProductoEtiqueta[] = productos.flatMap((p) => {
    const precio = precioDeVenta(p);
    if (precio === null) return [];
    const cambio = estado.pendientes.get(p.id);
    return [
      {
        id: p.id,
        nombre: p.name,
        saleUnit: p.saleUnit,
        precio,
        unidad: p.unit,
        gondola: gondolaDe(p),
        pausado: !p.active,
        cambioPendiente: cambio ? cambio.toISOString() : null,
      },
    ];
  });
  // El titular cuenta lo que la lista muestra (no borrado y con precio), con la MISMA función
  // que el botón del Inicio: los dos dicen el mismo número. Lo que cambió de precio y después
  // se borró o se quedó sin precio no lleva etiqueta: se dice aparte, entre paréntesis.
  const pendientesVisibles = pendientesEnLaLista(estado.pendientes, productos);
  const fueraDeLista = estado.pendientes.size - pendientesVisibles;

  const alDia =
    pendientesVisibles === 0
      ? "Todas las etiquetas están al día."
      : `${fmtNumberAR(pendientesVisibles)} ${pendientesVisibles === 1 ? "precio cambió y no se reimprimió" : "precios cambiaron y no se reimprimieron"}.`;

  // DISEÑO NUEVO («Renglón»): el titular dice lo que hay que reimprimir; a la izquierda qué
  // etiquetas y el papel, a la derecha la hoja como va a salir con «Imprimir». Mismo componente,
  // misma action, mismas cuentas que el botón del Inicio.
  if (await disenoNuevo()) {
    return (
      <main data-ui="pagina" className="mx-auto w-full max-w-6xl px-4 py-6">
        <header data-ui="page-header" className="mb-6">
          <h1 className="text-2xl font-bold text-strong">Etiquetas de precio</h1>
          <p className="mt-1 text-sm text-muted">
            <strong className={pendientesVisibles > 0 ? "text-strong" : "font-normal"}>{alDia}</strong>
            {fueraDeLista > 0 &&
              ` (${fueraDeLista === 1 ? "Otro cambió" : `Otros ${fmtNumberAR(fueraDeLista)} cambiaron`} de precio pero ya no ${fueraDeLista === 1 ? "lleva" : "llevan"} etiqueta: no ${fueraDeLista === 1 ? "está" : "están"} en el catálogo o no ${fueraDeLista === 1 ? "tiene" : "tienen"} precio.)`}
            {estado.ultimaImpresion && ` Última impresión: ${fmtDateTime(estado.ultimaImpresion)}.`}{" "}
            <Link href="/admin/catalogo" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
              Volver al catálogo
            </Link>
          </p>
        </header>
        {conPrecio.length === 0 ? (
          <p className="border-b border-line py-4 text-sm text-muted">
            {`Todavía no hay ${varios} con precio. Las etiquetas salen del precio de venta: cargalo en el catálogo y volvé. `}
            <Link href="/admin/catalogo" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
              Ir al catálogo
            </Link>
          </p>
        ) : (
          <Etiquetas productos={conPrecio} negocio={tenant?.name ?? ""} hoy={todayInBusinessTz()} sustantivo={{ uno, varios }} renglon />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Etiquetas de precio"
        description={`Los carteles de góndola y de heladera, con el precio por kilo grande en lo que se vende por peso. Empezá por los ${varios} que cambiaron de precio.`}
        actions={
          <Link href="/admin/catalogo" className={buttonClasses("outline", "md")}>
            Volver al catálogo
          </Link>
        }
      />
      <p className="-mt-2 mb-6 text-sm text-body">
        <span className={pendientesVisibles > 0 ? "font-semibold text-strong" : undefined}>
          {pendientesVisibles === 0
            ? "Todas las etiquetas están al día."
            : `${fmtNumberAR(pendientesVisibles)} ${pendientesVisibles === 1 ? "precio cambió y no se reimprimió" : "precios cambiaron y no se reimprimieron"}.`}
        </span>
        {fueraDeLista > 0 && (
          <span className="text-muted">
            {" "}
            ({fueraDeLista === 1 ? "Otro cambió" : `Otros ${fmtNumberAR(fueraDeLista)} cambiaron`} de precio y ya no {fueraDeLista === 1 ? "está" : "están"} en el catálogo o no {fueraDeLista === 1 ? "tiene" : "tienen"} precio: no {fueraDeLista === 1 ? "lleva" : "llevan"} etiqueta.)
          </span>
        )}
        {estado.ultimaImpresion && <span className="text-muted"> Última impresión: {fmtDateTime(estado.ultimaImpresion)}.</span>}
      </p>
      {conPrecio.length === 0 ? (
        <EmptyState
          title={`Todavía no hay ${varios} con precio`}
          description={`Las etiquetas salen del precio de venta. Cargá los precios en el catálogo y volvé.`}
          action={
            <Link href="/admin/catalogo" className={buttonClasses("solid", "md")}>
              Ir al catálogo
            </Link>
          }
        />
      ) : (
        <Etiquetas productos={conPrecio} negocio={tenant?.name ?? ""} hoy={todayInBusinessTz()} sustantivo={{ uno, varios }} />
      )}
    </main>
  );
}
