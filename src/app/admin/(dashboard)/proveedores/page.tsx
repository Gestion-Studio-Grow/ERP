import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { listSuppliers } from "@/lib/suppliers/supplier-repo";
import { EmptyState, PageHeader, Badge, buttonClasses, fmtCuit } from "@/components/ui";
import { ProveedorForm } from "./ProveedorForm";

export const dynamic = "force-dynamic";

// PROVEEDORES: la ficha única de cada uno, para dejar de tenerlos como texto suelto en cada
// compra. Con el maestro cargado, Recibir mercadería los ofrece para elegir y cada compra
// queda en la ficha del proveedor, con su deuda y sus devoluciones.
export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ bajas?: string | string[] }>;
}) {
  await requireApp("proveedores");
  const sp = await searchParams;
  const conBajas = (Array.isArray(sp.bajas) ? sp.bajas[0] : sp.bajas) === "1";
  const tenantId = await getCurrentTenantId();
  const proveedores = await listSuppliers(tenantId, { includeInactive: conBajas });
  const sinCuit = proveedores.filter((p) => p.active && !p.taxId).length;

  // Primero la lista (es lo que se viene a buscar: el teléfono de uno, su deuda) y el alta
  // abajo; en el celular, con el alta arriba, había que bajar un formulario entero para llegar
  // al primer proveedor.
  const alta = (
    <section id="nuevo-proveedor" aria-labelledby="alta-titulo" className="scroll-mt-4 rounded-lg border border-line p-4">
      <h2 id="alta-titulo" className="mb-3 text-base font-semibold text-strong">
        Nuevo proveedor
      </h2>
      <ProveedorForm modo="alta" />
    </section>
  );

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Proveedores"
        description="A quién le comprás: CUIT, contacto, compras, deuda y devoluciones de cada uno."
        actions={
          <>
            {proveedores.length > 0 && (
              <a href="#nuevo-proveedor" className={buttonClasses("solid", "md")}>
                Nuevo proveedor
              </a>
            )}
            <Link href={conBajas ? "/admin/proveedores" : "/admin/proveedores?bajas=1"} className={buttonClasses("outline", "md")}>
              {conBajas ? "Sólo los activos" : "Ver también los dados de baja"}
            </Link>
          </>
        }
      />

      {sinCuit > 0 && (
        <p className="mb-3 text-sm text-warning">
          {sinCuit === 1 ? "1 proveedor no tiene CUIT" : `${sinCuit} proveedores no tienen CUIT`}: cargalo desde su ficha
          (está en la factura) para poder cruzar sus compras con la contadora.
        </p>
      )}

      {proveedores.length === 0 ? (
        <div className="space-y-6">
          <EmptyState
            title="No hay proveedores"
            description="Cargá el primero acá abajo: después lo elegís de una lista cada vez que recibís mercadería, y su ficha junta compras, deuda y devoluciones."
            action={
              <a href="#nuevo-proveedor" className={buttonClasses("solid", "md")}>
                Cargar el primero
              </a>
            }
          />
          {alta}
        </div>
      ) : (
        <div className="space-y-8">
          <ul className="divide-y divide-line rounded-lg border border-line">
            {proveedores.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/proveedores/${encodeURIComponent(p.id)}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-sunken"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-strong">
                      {p.name} {!p.active && <Badge tone="neutral">Dado de baja</Badge>}
                    </span>
                    <span className="block text-xs text-muted">
                      {p.taxId ? `CUIT ${fmtCuit(p.taxId)}` : "Sin CUIT"}
                      {p.phone && ` · ${p.phone}`}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {p._count.purchases === 1 ? "1 compra" : `${p._count.purchases} compras`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {alta}
        </div>
      )}
    </main>
  );
}
