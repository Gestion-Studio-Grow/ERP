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
import ActualizarPrecios from "./ActualizarPrecios";

export const dynamic = "force-dynamic";

// ACTUALIZAR PRECIOS: qué productos, cuánto, cómo se redondea, vista previa y Aplicar. La
// vista previa se calcula en la pantalla con la misma función que usa el servidor
// (aumento-core.ts); al aplicar, el servidor la vuelve a armar contra la base y se niega si
// no da lo mismo que vio la persona.
export default async function ActualizarPreciosPage() {
  const user = await requireApp("actualizar-precios");
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
          productos={productos.map((p) => ({
            id: p.id,
            name: p.name,
            active: p.active,
            saleUnit: p.saleUnit,
            price: p.price,
            pricePerKg: p.pricePerKg,
            category: p.category,
          }))}
          sustantivo={{ uno, varios }}
          veEtiquetas={veEtiquetas}
        />
      )}
    </main>
  );
}
