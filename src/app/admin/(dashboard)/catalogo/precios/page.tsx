import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { todayInBusinessTz } from "@/lib/datetime";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { cargarProductosParaPrecios, cargarUltimoAumento } from "@/lib/catalogo/precios-lectura";
import { haceCuanto } from "@/lib/catalogo/precios-auditoria";
import { EmptyState, PageHeader, buttonClasses } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import ActualizarPrecios from "./ActualizarPrecios";
import { prisma } from "@/lib/prisma";
import { leerIdsTildados } from "../lista-core";

export const dynamic = "force-dynamic";

// ACTUALIZAR PRECIOS: qué productos, cuánto, cómo se redondea, vista previa y Aplicar. La
// vista previa se calcula en la pantalla con la misma función que usa el servidor
// (aumento-core.ts); al aplicar, el servidor la vuelve a armar contra la base y se niega si
// no da lo mismo que vio la persona.
export default async function ActualizarPreciosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireApp("actualizar-precios");
  // Desde la selección del catálogo (diseño nuevo): `?ids=` llega con esos productos tildados. La
  // persona igual ve la lista, puede cambiarla y aplica con la vista previa de siempre.
  const tildados = leerIdsTildados(await searchParams);
  const tenantId = await getCurrentTenantId();
  const [productos, ultimo, rubro, negocio] = await Promise.all([
    cargarProductosParaPrecios(tenantId),
    cargarUltimoAumento(tenantId, todayInBusinessTz()),
    getCurrentTenantRubro(),
    getNegocioApps(user.role),
  ]);
  const uno = rubro.rubro?.wording.itemNoun?.trim() || "producto";
  const varios = uno.endsWith("s") ? uno : `${uno}s`;
  const veEtiquetas = appPermitida(appPorId("etiquetas-de-precio"), negocio);

  const ultimoTexto = ultimo
    ? `Último cambio general: ${haceCuanto(ultimo.dias)}` +
      (ultimo.porcentaje ? ` (${ultimo.porcentaje})` : ultimo.origen === "planilla" ? " (por planilla)" : "") +
      "."
    : "Todavía no se cambiaron precios en bloque desde el sistema.";

  const paraLaPantalla = productos.map((p) => ({
    id: p.id,
    name: p.name,
    active: p.active,
    saleUnit: p.saleUnit,
    price: p.price,
    pricePerKg: p.pricePerKg,
    category: p.category,
    seccion: p.seccion,
    proveedores: p.proveedores,
    costo: p.costo,
  }));
  // Supermercado: elegir por sección. Cualquier comercio con proveedores: elegir por proveedor.
  // Las secciones del salón, si el rubro las declara (rubros.ts `secciones`): "subir una sección".
  const secciones = rubro.rubro?.secciones?.lista.map((s) => ({ id: s.id, nombre: s.titulo })) ?? [];
  const conProveedor = new Set(productos.flatMap((p) => p.proveedores ?? []));
  const proveedores = conProveedor.size
    ? await prisma.supplier.findMany({ where: { tenantId, id: { in: [...conProveedor] } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];
  const extras = { secciones, proveedores: proveedores.map((x) => ({ id: x.id, nombre: x.name })) };

  // DISEÑO NUEVO («Renglón»): el título con el último cambio en una línea; los pasos a la
  // izquierda y la pizarra (antes → después, con Aplicar) a la derecha. Mismo componente y
  // misma action; sin el interruptor, la pantalla de siempre.
  if (await disenoNuevo()) {
    return (
      <main data-ui="pagina" className="mx-auto w-full max-w-6xl px-4 py-6">
        <header data-ui="page-header" className="mb-6">
          <h1 className="text-2xl font-bold text-strong">Actualizar precios</h1>
          <p className="mt-1 text-sm text-muted">
            {`${ultimoTexto} Los pedidos ya tomados conservan su precio. `}
            <Link href="/admin/catalogo" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
              Volver al catálogo
            </Link>
          </p>
        </header>
        {productos.length === 0 ? (
          <p className="border-b border-line py-4 text-sm text-muted">
            {`Todavía no hay ${varios} en el catálogo. Cargalos con su precio (de a uno o con la planilla) y volvé para actualizarlos todos juntos. `}
            <Link href="/admin/catalogo" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
              Ir al catálogo
            </Link>
          </p>
        ) : (
          <ActualizarPrecios productos={paraLaPantalla} sustantivo={{ uno, varios }} veEtiquetas={veEtiquetas} tildadosIniciales={tildados} renglon {...extras} />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Actualizar precios"
        description={`Subí o bajá el precio de muchos ${varios} a la vez. Antes de guardar ves cómo queda cada uno; los pedidos ya tomados conservan su precio.`}
        actions={
          <Link href="/admin/catalogo" className={buttonClasses("outline", "md")}>
            Volver al catálogo
          </Link>
        }
      />
      <p className="-mt-2 mb-6 text-sm text-muted">{ultimoTexto}</p>
      {productos.length === 0 ? (
        <EmptyState
          title={`Todavía no hay ${varios} en el catálogo`}
          description={`Cargá tus ${varios} con su precio en el catálogo (de a uno o con la planilla) y volvé para actualizarlos todos juntos.`}
          action={
            <Link href="/admin/catalogo" className={buttonClasses("solid", "md")}>
              Ir al catálogo
            </Link>
          }
        />
      ) : (
        <ActualizarPrecios
          productos={paraLaPantalla}
          sustantivo={{ uno, varios }}
          veEtiquetas={veEtiquetas}
          tildadosIniciales={tildados}
          {...extras}
        />
      )}
    </main>
  );
}
