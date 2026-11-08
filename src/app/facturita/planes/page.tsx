// FACTURITA · Planes — Factoque Gratis, Plus y Pro (PLAN-SALIDA-2026-11 §2: la misma app, cambia el
// tope) y Comerciante como «lo que sigue», sin botón. Los números salen de src/lib/facturita-planes.ts
// (única fuente: la misma que usa el tope de la emisión).
//
// Rediseño 29/10/2026 (fronts/facturita/DISENO.md §5.2): cada plan es una hoja del talonario.
// Los precios de Factoque (Gratis/Plus/Pro) son finales (dueño, 08/11/2026). La leyenda interna
// `ESTADO_PRECIOS` («…a confirmar por el dueño») queda sólo para Comerciante: sigue existiendo en la
// constante, en su test y en la app logueada, pero la vidriera pública ya no la imprime: dice la
// frase pública de abajo (PRECIOS_DE_REFERENCIA), que es igual de honesta y no habla del dueño.

import type { Metadata } from "next";
import Link from "next/link";
import {
  ACLARACION_IVA,
  ALIAS_TRANSFERENCIA_GSG,
  LO_QUE_SIGUE,
  PLAN_FACTOQUE_PLUS,
  PLAN_FACTOQUE_PRO,
  PLAN_FACTURITA,
  precioTexto,
  type Plan,
} from "@/lib/facturita-planes";
import VidrieraMarco from "../VidrieraMarco";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO } from "../estilos";
import { canalGsg, linkCanal, type CanalGsg } from "../contacto";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Planes — Factoque",
  description: `Factoque es gratis hasta ${PLAN_FACTURITA.facturasPorMes} facturas por mes. Si necesitás más, Plus (${PLAN_FACTOQUE_PLUS.facturasPorMes}) o Pro (${PLAN_FACTOQUE_PRO.facturasPorMes}), en la misma app.`,
  generator: "Gestión Studio Grow",
};

/** Lo que la vidriera dice en lugar de la leyenda interna mientras los precios no estén confirmados. */
const PRECIOS_DE_REFERENCIA =
  "Factoque es gratis. Plus y Pro son precios finales por mes, IVA incluido.";

/**
 * «Pasar a Plus/Pro»: todavía no hay cobro online (PLAN-SALIDA §2). Se paga por transferencia a GSG
 * y se manda el comprobante por el canal de GSG (WhatsApp si está cargado; si no, mail); el operador
 * activa el plan desde la ficha. El alias es un placeholder hasta que el dueño lo confirme.
 */
function Pasar({ plan, canal }: { plan: Plan; canal: CanalGsg }) {
  const texto = `¡Hola! Quiero pasar al plan ${plan.nombre} de Factoque (${precioTexto(plan.precioMensual)} por mes). Te mando el comprobante de la transferencia.`;
  return (
    <div style={{ marginTop: "auto", paddingTop: 24 }}>
      <p className="fx-chico" style={{ margin: "0 0 10px" }} data-qa="alias-transferencia">
        Transferí {precioTexto(plan.precioMensual)} al alias de Gestión Studio Grow: <strong>{ALIAS_TRANSFERENCIA_GSG}</strong>. Mandanos
        el comprobante y lo activamos apenas lo vemos.
      </p>
      <a href={linkCanal(canal, `Pasar a ${plan.nombre}`, texto)} target="_blank" rel="noopener noreferrer" className={BOTON_SECUNDARIO} style={{ width: "100%" }} data-qa="pasar-plan">
        Pasar a {plan.nombre.replace("Factoque ", "")}
        {canal.tipo === "whatsapp" ? " por WhatsApp" : " por mail"}
      </a>
    </div>
  );
}

function HojaPlan({ plan, grande = false, canal }: { plan: Plan; grande?: boolean; canal?: CanalGsg }) {
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
      {canal && plan.precioMensual > 0 && <Pasar plan={plan} canal={canal} />}
    </article>
  );
}

export default function FacturitaPlanesPage() {
  const canal = canalGsg();
  return (
    <VidrieraMarco barraFija="siempre">
      <div className="fx-caja" style={{ paddingBlock: "clamp(40px, 3rem + 3vw, 112px) var(--fx-seccion)" }}>
        <h1 className="fx-h1">Planes</h1>
        <p className="fx-lead">
          Factoque es gratis. Si un mes te queda chico, pasás a Plus o a Pro en la misma app: lo único que cambia es
          cuántas facturas hacés por mes. Nunca se cobra por usuario.
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
              <li>Te avisamos desde la anteúltima: nunca te enterás en el mostrador.</li>
              <li>Lo que ya emitiste queda siempre en tu cuenta, cambies o no de plan.</li>
            </ul>
            <div style={{ marginTop: 8 }}>
              <Link href="/facturita/alta" className={BOTON_PRINCIPAL}>
                Empezar gratis
              </Link>
            </div>
          </div>
        </div>

        <h2 className="fx-h2" style={{ marginTop: "var(--fx-seccion)" }}>
          <em>Más facturas</em>, la misma app
        </h2>
        <div className="fx-planes-4 fx-planes-2">
          {[PLAN_FACTOQUE_PLUS, PLAN_FACTOQUE_PRO].map((p) => (
            <HojaPlan key={p.id} plan={p} canal={canal} />
          ))}
        </div>

        <h2 className="fx-h3" style={{ marginTop: "var(--fx-seccion)" }}>
          Lo que sigue: {LO_QUE_SIGUE.nombre.replace(/\s+Solo$/, "")}
        </h2>
        <p className="fx-bajada" data-qa="lo-que-sigue">
          Cuando quieras que lo que te entra al banco o a Mercado Pago se facture solo, y que tu contador mire todo,
          eso es Comerciante: otro producto de Gestión Studio Grow, desde {precioTexto(LO_QUE_SIGUE.precioMensual)} por
          mes (precio de referencia, a confirmar). Hoy no se contrata desde Factoque.
        </p>
        <p className="fx-chico" style={{ margin: "28px 0 0" }}>
          {ACLARACION_IVA}.
        </p>
        <div style={{ marginTop: 40 }}>
          <Link href="/facturita" className={BOTON_SECUNDARIO}>
            Volver a Factoque
          </Link>
        </div>
      </div>
    </VidrieraMarco>
  );
}
