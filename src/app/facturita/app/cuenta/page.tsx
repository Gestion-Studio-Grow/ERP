// FACTURITA · Mi cuenta — los datos fiscales del emisor, el estado de ARCA y
// el gancho de upgrade: cuando el negocio crece, Comerciante es activar más
// módulos en el MISMO espacio, sin migrar nada (ADR-076).

import { PageHeader, Badge } from "@/components/ui";
import { getFacturacion } from "@/lib/facturacion-actions";
import { estadoFacturitaAction } from "@/lib/facturita-actions";

export const dynamic = "force-dynamic";

function cuitConGuiones(cuit: string | null): string {
  if (!cuit || cuit.length !== 11) return cuit ?? "—";
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

export default async function FacturitaCuentaPage() {
  const [{ estado }, limite] = await Promise.all([getFacturacion(), estadoFacturitaAction()]);

  return (
    <>
      <PageHeader title="Mi cuenta" description="Tus datos fiscales y el estado del servicio." />

      <dl className="mb-6 divide-y divide-line-soft rounded-xl border border-line bg-surface-raised shadow-card">
        <div className="flex items-center justify-between gap-4 px-[22px] py-[13px] text-sm">
          <dt className="text-muted">CUIT del emisor</dt>
          <dd className="font-medium tabular-nums text-strong">{cuitConGuiones(estado.cuit)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-[22px] py-[13px] text-sm">
          <dt className="text-muted">Punto de venta</dt>
          <dd className="font-medium tabular-nums text-strong">
            {estado.puntoVenta != null ? String(estado.puntoVenta).padStart(4, "0") : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-[22px] py-[13px] text-sm">
          <dt className="text-muted">Estado de ARCA</dt>
          <dd>
            {estado.homologacion ? (
              <Badge tone="warning" dot>Homologación (pruebas oficiales)</Badge>
            ) : (
              <Badge tone="success" dot>En línea</Badge>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-[22px] py-[13px] text-sm">
          <dt className="text-muted">Plan</dt>
          <dd className="text-strong">
            Gratis — {limite.usadas} de {limite.limite} facturas usadas este mes
          </dd>
        </div>
      </dl>

      <section className="rounded-xl border border-line bg-surface-sunken px-[22px] py-5">
        <h2 className="text-sm font-semibold text-strong">¿Te quedaste corto?</h2>
        <p className="mt-1 text-sm text-muted">
          Con <strong className="font-semibold text-strong">Comerciante</strong> facturás sin límite y,
          mejor todavía: subís el extracto del banco o conectás Mercado Pago y las facturas se arman
          solas. Es el mismo espacio, con más músculo — no perdés nada de lo que ya emitiste.
        </p>
        <p className="mt-2 text-sm text-muted">
          Escribinos y lo activamos en el día.
        </p>
      </section>
    </>
  );
}
