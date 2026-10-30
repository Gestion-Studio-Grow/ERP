// FACTURITA · Planes — Facturita gratis y la escalera de Comerciante (ADR-078). Los números salen
// de src/lib/facturita-planes.ts (única fuente).
//
// Rediseño 29/10/2026 (fronts/facturita/DISENO.md §5.2): cada plan es una hoja del talonario.
// La leyenda interna `ESTADO_PRECIOS` («…a confirmar por el dueño») sigue existiendo en la
// constante, en su test y en la app logueada, pero la vidriera pública ya no la imprime: dice la
// frase pública de abajo (PRECIOS_DE_REFERENCIA), que es igual de honesta y no habla del dueño.

import type { Metadata } from "next";
import Link from "next/link";
import {
  ACLARACION_IVA,
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

/** Lo que la vidriera dice en lugar de la leyenda interna mientras los precios no estén confirmados. */
const PRECIOS_DE_REFERENCIA =
  "Facturita es gratis. Lo demás es Comerciante, con precios de referencia que confirmamos antes de cobrarte.";

function HojaPlan({ plan, grande = false }: { plan: Plan; grande?: boolean }) {
  const titulo = `plan-${plan.id}`;
  return (
    <article aria-labelledby={titulo} className={`fx-hoja-plan${grande ? "" : " fx-hoja-plan--quieta"}`}>
      {grande ? (
        <h2 id={titulo} className="fx-h3">
          {plan.nombre}
        </h2>
      ) : (
        <h3 id={titulo} className="fx-h3">
          {plan.nombre}
        </h3>
      )}
      <p className="fx-tenue" style={{ margin: "6px 0 0" }}>
        {plan.para}
      </p>
      <p className={`fx-precio${grande ? "" : " fx-precio--m"}`}>
        {precioTexto(plan.precioMensual)}
        {plan.precioMensual > 0 && <small> por mes</small>}
      </p>
      <p className="fx-tenue" style={{ margin: "8px 0 0" }}>
        Hasta {plan.facturasPorMes.toLocaleString("es-AR")} facturas por mes
      </p>
      {plan.nota && (
        <p className="fx-chico" style={{ margin: "8px 0 0" }}>
          {plan.nota}
        </p>
      )}
      <ul className="fx-lista">
        {plan.incluye.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {plan.noIncluye && (
        <>
          <p className="fx-cap" style={{ margin: "24px 0 0" }}>
            No incluye
          </p>
          <ul className="fx-lista fx-lista--no" style={{ marginTop: 10 }}>
            {plan.noIncluye.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

export default function FacturitaPlanesPage() {
  return (
    <VidrieraMarco barraFija="siempre">
      <div className="fx-caja" style={{ paddingBlock: "clamp(40px, 3rem + 3vw, 112px) var(--fx-seccion)" }}>
        <h1 className="fx-h1">Planes</h1>
        <p className="fx-lead">
          Facturita es gratis. Si un día te queda chica, pasás a Comerciante en el mismo lugar: nunca se cobra por
          usuario, se cobra por el tamaño de tu negocio.
        </p>
        <p className="fx-bajada">{PRECIOS_DE_REFERENCIA}</p>

        <div className="fx-planes-top">
          <HojaPlan plan={PLAN_FACTURITA} grande />
          <div className="fx-cuando">
            <p className="fx-h3" style={{ margin: 0 }}>
              ¿Cuándo conviene pasar?
            </p>
            <ul className="fx-lista" style={{ marginTop: 4 }}>
              <li>Cuando un mes necesitás más de {PLAN_FACTURITA.facturasPorMes} facturas.</li>
              <li>Cuando querés que lo que te entra al banco se facture solo.</li>
              <li>Cuando querés cobrar con Mercado Pago y que la factura salga sola.</li>
            </ul>
            <div style={{ marginTop: 8 }}>
              <Link href="/facturita/alta" className={BOTON_PRINCIPAL}>
                Empezar gratis
              </Link>
            </div>
          </div>
        </div>

        <h2 className="fx-h2" style={{ marginTop: "var(--fx-seccion)" }}>
          <em>Comerciante</em>
        </h2>
        <p className="fx-bajada">La misma cuenta, con más músculo. Elegís por el tamaño de tu negocio.</p>
        <div className="fx-planes-4">
          {PLANES_COMERCIANTE.map((p) => (
            <HojaPlan key={p.id} plan={p} />
          ))}
        </div>
        <p className="fx-chico" style={{ margin: "28px 0 0" }}>
          {ACLARACION_IVA}. {ORIGEN_LISTA}.
        </p>
        <div style={{ marginTop: 40 }}>
          <Link href="/facturita" className={BOTON_SECUNDARIO}>
            Volver a Facturita
          </Link>
        </div>
      </div>
    </VidrieraMarco>
  );
}
