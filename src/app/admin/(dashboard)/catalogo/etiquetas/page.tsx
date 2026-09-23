import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { fmtDateTime, todayInBusinessTz } from "@/lib/datetime";
import { cargarEstadoEtiquetas, cargarProductosParaPrecios } from "@/lib/catalogo/precios-lectura";
import { gondolaDe, precioDeVenta } from "@/lib/catalogo/aumento-core";
import { EmptyState, PageHeader, buttonClasses, fmtNumberAR } from "@/components/ui";
import Etiquetas, { type ProductoEtiqueta } from "./Etiquetas";

export const dynamic = "force-dynamic";

// ETIQUETAS DE PRECIO. Arranca con lo que hay que reimprimir: los productos cuyo precio cambió
// después de su última etiqueta impresa (precios-auditoria.ts). El número de arriba es el
// mismo que el del botón del Inicio: sale de la misma consulta y la misma cuenta.
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
  const pendientesTotal = estado.pendientes.size;
  const pendientesVisibles = conPrecio.filter((p) => p.cambioPendiente !== null).length;
  // El número del botón cuenta también un producto que después se borró o se quedó sin
  // precio: acá se dice aparte, para que los dos números sigan siendo el mismo.
  const fueraDeLista = pendientesTotal - pendientesVisibles;

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
        <span className={pendientesTotal > 0 ? "font-semibold text-strong" : undefined}>
          {pendientesTotal === 0
            ? "Todas las etiquetas están al día."
            : `${fmtNumberAR(pendientesTotal)} ${pendientesTotal === 1 ? "precio cambió y no se reimprimió" : "precios cambiaron y no se reimprimieron"}.`}
        </span>
        {fueraDeLista > 0 && (
          <span className="text-muted">
            {" "}
            ({fmtNumberAR(fueraDeLista)} ya no {fueraDeLista === 1 ? "está" : "están"} en el catálogo o no {fueraDeLista === 1 ? "tiene" : "tienen"} precio.)
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
