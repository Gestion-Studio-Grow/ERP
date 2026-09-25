import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { listSuppliers } from "@/lib/suppliers/supplier-repo";
import { EmptyState, PageHeader, Badge, buttonClasses, fmtCuit, Bloque, LineaDeEstado, Marca, Renglon } from "@/components/ui";
import { ProveedorForm } from "./ProveedorForm";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import CajonPorUrl from "../CajonPorUrl";

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
  const [sp, nuevo] = await Promise.all([searchParams, disenoNuevo()]);
  const conBajas = (Array.isArray(sp.bajas) ? sp.bajas[0] : sp.bajas) === "1";
  const tenantId = await getCurrentTenantId();
  const proveedores = await listSuppliers(tenantId, { includeInactive: conBajas });
  const sinCuit = proveedores.filter((p) => p.active && !p.taxId).length;

  // DISEÑO NUEVO («Renglón»): un renglón por proveedor (nombre a su ficha, CUIT y teléfono, cuántas
  // compras), la tecla «Escribirle» por WhatsApp si hay teléfono y el alta en un cajón. La misma
  // lectura (listSuppliers) y el mismo formulario; el alta sigue llevando a la ficha nueva.
  if (nuevo) {
    const activos = proveedores.filter((p) => p.active).length;
    const conmutar = conBajas ? "/admin/proveedores" : "/admin/proveedores?bajas=1";
    return (
      <main data-ui="pagina" className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Proveedores"
          actions={
            <Link href={conBajas ? "/admin/proveedores?bajas=1&agregar=1" : "/admin/proveedores?agregar=1"} scroll={false} className={buttonClasses("solid", "md")}>
              Nuevo proveedor
            </Link>
          }
        />
        <LineaDeEstado
          className="-mt-2 mb-4"
          datos={[
            <strong key="a">{activos === 1 ? "1 activo" : `${activos} activos`}</strong>,
            sinCuit > 0 ? <Marca key="c" tipo="atencion">{sinCuit === 1 ? "1 sin CUIT" : `${sinCuit} sin CUIT`}</Marca> : null,
            <Link key="b" href={conmutar} className="underline underline-offset-2">
              {conBajas ? "Sólo los activos" : "Ver también los dados de baja"}
            </Link>,
          ]}
        />
        <Bloque titulo="A quién le comprás" cuenta={proveedores.length} className="mt-6">
          {proveedores.length === 0 ? (
            <p data-ui="vacio" className="border-b border-line py-4 text-sm text-body">
              Todavía no hay proveedores. Cargá el primero con «Nuevo proveedor»: después lo elegís de una lista al recibir mercadería.
            </p>
          ) : (
            <ul data-sin-folio>
              {proveedores.map((p) => {
                const wa = p.active ? waLinkClienta(p.phone) : null;
                return (
                  <Renglon
                    key={p.id}
                    as="li"
                    titulo={
                      <Link href={`/admin/proveedores/${encodeURIComponent(p.id)}`} className="hover:underline">
                        {p.name}
                      </Link>
                    }
                    detalle={
                      <>
                        {p.taxId ? `CUIT ${fmtCuit(p.taxId)}` : <Marca tipo="atencion">sin CUIT</Marca>}
                        {p.phone && ` · ${p.phone}`}
                        {` · ${p._count.purchases === 1 ? "1 compra" : `${p._count.purchases} compras`}`}
                        {!p.active && (
                          <>
                            {" · "}
                            <Marca tipo="anulado">dado de baja</Marca>
                          </>
                        )}
                      </>
                    }
                    tecla={
                      wa ? (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "sm")}>
                          Escribirle
                        </a>
                      ) : (
                        <Link href={`/admin/proveedores/${encodeURIComponent(p.id)}`} className={buttonClasses("outline", "sm")}>
                          Ver ficha
                        </Link>
                      )
                    }
                  />
                );
              })}
            </ul>
          )}
        </Bloque>
        <CajonPorUrl titulo="Nuevo proveedor">
          <ProveedorForm modo="alta" />
        </CajonPorUrl>
      </main>
    );
  }

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
