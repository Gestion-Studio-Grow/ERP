// FACTURITA · Planes — Facturita gratis y la escalera de Comerciante (ADR-078). Los números salen
// de src/lib/facturita-planes.ts (única fuente) y se muestran SIEMPRE con la leyenda de
// provisionales: el dueño todavía no confirmó la lista para esta vidriera.

import type { Metadata } from "next";
import Link from "next/link";
import {
  ACLARACION_IVA,
  ESTADO_PRECIOS,
  ORIGEN_LISTA,
  PLAN_FACTURITA,
  PLANES_COMERCIANTE,
  precioTexto,
  type Plan,
} from "@/lib/facturita-planes";
import VidrieraMarco from "../VidrieraMarco";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO } from "../estilos";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Planes — Facturita",
  description: "Facturita es gratis hasta 5 facturas por mes. Cuando crecés, pasás a Comerciante sin migrar nada.",
  generator: "Gestión Studio Grow",
};

function TarjetaPlan({ plan, destacado = false }: { plan: Plan; destacado?: boolean }) {
  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={`flex flex-col rounded-xl bg-surface-raised p-6 ${destacado ? "border-2 border-accent" : "border border-line"}`}
    >
      <h2 id={`plan-${plan.id}`} className="text-lg font-semibold text-strong">
        {plan.nombre}
      </h2>
      <p className="mt-1 text-sm text-muted">{plan.para}</p>
      <p className="mt-4 text-3xl font-semibold tabular-nums text-strong">
        {precioTexto(plan.precioMensual)}
        {plan.precioMensual > 0 && <span className="text-base font-normal text-muted"> por mes</span>}
      </p>
      <p className="text-sm text-muted">
        Hasta {plan.facturasPorMes.toLocaleString("es-AR")} facturas por mes
      </p>
      {plan.nota && <p className="mt-2 text-xs text-faint">{plan.nota}</p>}
      <ul className="mt-4 space-y-2 text-sm text-body">
        {plan.incluye.map((x) => (
          <li key={x}>✓ {x}</li>
        ))}
      </ul>
      {plan.noIncluye && (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[.06em] text-muted">No incluye</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {plan.noIncluye.map((x) => (
              <li key={x}>— {x}</li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

export default function FacturitaPlanesPage() {
  return (
    <VidrieraMarco>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="font-display text-3xl tracking-[-0.02em] text-strong sm:text-4xl">Planes</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Facturita es gratis. Si un día te queda chica, pasás a Comerciante en el mismo lugar: nunca se cobra por
          usuario, se cobra por el tamaño de tu negocio.
        </p>
        <p role="note" className="mt-4 inline-block rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          {ESTADO_PRECIOS}.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <TarjetaPlan plan={PLAN_FACTURITA} destacado />
          <div className="flex flex-col justify-center gap-3 rounded-xl border border-line bg-surface-sunken p-6">
            <p className="text-base font-semibold text-strong">¿Cuándo conviene pasar?</p>
            <ul className="space-y-2 text-sm text-muted">
              <li>Cuando un mes necesitás más de {PLAN_FACTURITA.facturasPorMes} facturas.</li>
              <li>Cuando querés que lo que te entra al banco se facture solo.</li>
              <li>Cuando querés cobrar con Mercado Pago y que la factura salga sola.</li>
            </ul>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Link href="/facturita/alta" className={BOTON_PRINCIPAL}>
                Empezar gratis
              </Link>
            </div>
          </div>
        </div>

        <h2 className="mt-14 font-display text-2xl tracking-[-0.01em] text-strong">Comerciante</h2>
        <p className="mt-2 max-w-2xl text-muted">La misma cuenta, con más músculo. Elegís por el tamaño de tu negocio.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANES_COMERCIANTE.map((p) => (
            <TarjetaPlan key={p.id} plan={p} />
          ))}
        </div>
        <p className="mt-6 text-xs text-faint">
          {ACLARACION_IVA}. {ORIGEN_LISTA}. {ESTADO_PRECIOS}.
        </p>
        <div className="mt-8">
          <Link href="/facturita" className={BOTON_SECUNDARIO}>
            Volver a Facturita
          </Link>
        </div>
      </div>
    </VidrieraMarco>
  );
}
