// FACTURITA · Mi cuenta — los datos fiscales del emisor, el estado de ARCA, la tarjeta «Conectar con
// ARCA» (Plan de salida 11/2026 §1 #6), el plan que rige hoy (Gratis / Plus / Pro, de la misma fuente
// que el tope de la emisión) y cómo pasar al siguiente: transferencia a GSG + WhatsApp, sin cobro
// online todavía (PLAN-SALIDA-2026-11 §2).

import { PageHeader, Badge } from "@/components/ui";
import { getFacturacion } from "@/lib/facturacion-actions";
import { datosParaFacturasAction, estadoFacturitaAction, planFacturitaAction } from "@/lib/facturita-actions";
import { faltantesEmisor, formDesdeGuardado } from "@/lib/facturita-emisor";
import DatosParaFacturas from "./DatosParaFacturas";
import MercadoPagoConexion from "./MercadoPagoConexion";
import { sesionFacturita } from "@/lib/facturita-sesion.server";
import Link from "next/link";
import {
  ALIAS_TRANSFERENCIA_GSG,
  PLANES_FACTOQUE,
  PLAN_FACTURITA,
  precioConPeriodo,
  precioTexto,
} from "@/lib/facturita-planes";
import { canalGsg, linkCanal } from "../../contacto";
import { LINK_CONECTAR_ARCA } from "@/lib/facturita-core";
import { estadoConexionArca } from "@/lib/facturita-arca";
import { leerFichaDelPase } from "@/lib/operador/pase-a-real.server";
import { modoDesdeEnv } from "@/plugins/arca";

export const dynamic = "force-dynamic";

function cuitConGuiones(cuit: string | null): string {
  if (!cuit || cuit.length !== 11) return cuit ?? "—";
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default async function FacturitaCuentaPage({ searchParams }: { searchParams: Promise<{ mp?: string | string[] }> }) {
  const [{ estado }, limite, plan, guardados, { tenantId }, q] = await Promise.all([
    getFacturacion(),
    estadoFacturitaAction(),
    planFacturitaAction(),
    datosParaFacturasAction(),
    sesionFacturita(),
    searchParams,
  ]);
  const avisoMp = typeof q.mp === "string" ? q.mp : undefined;
  // La ficha del pase se lee con el tenantId de la SESIÓN (nunca de la URL): sólo el propio negocio.
  const arca = estadoConexionArca(await leerFichaDelPase(tenantId, modoDesdeEnv()).catch(() => null));
  const i = PLANES_FACTOQUE.findIndex((p) => p.id === plan.id);
  const actual = PLANES_FACTOQUE[i] ?? PLAN_FACTURITA;
  const siguiente = PLANES_FACTOQUE[i + 1] ?? null;
  const canal = canalGsg();

  return (
    <>
      <PageHeader title="Mi cuenta" description="Tus datos fiscales y el estado del servicio." />
      {/* Res. SCI 424/2020 y Res. 316/2018: a la vista y sin más pasos que contratar. */}
      <nav aria-label="Arrepentimiento y baja" className="-mt-2 mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link href="/facturita/app/cuenta/tramite?tipo=arrepentimiento" className="inline-flex min-h-11 items-center font-medium text-strong underline underline-offset-4">
          Botón de arrepentimiento
        </Link>
        <Link href="/facturita/app/cuenta/tramite?tipo=baja" className="inline-flex min-h-11 items-center font-medium text-strong underline underline-offset-4">
          Darme de baja
        </Link>
      </nav>

      <dl className="mb-6 divide-y divide-line-soft rounded-xl border border-line bg-surface-raised shadow-card">
        <div className="flex items-center justify-between gap-4 px-[22px] py-[13px] text-sm">
          <dt className="text-muted">CUIT del emisor</dt>
          <dd className="font-medium tabular-nums text-strong">{cuitConGuiones(estado.cuit)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-[22px] py-[13px] text-sm">
          <dt className="text-muted">Punto de venta</dt>
          <dd className="font-medium tabular-nums text-strong">
            {estado.puntoVenta != null ? String(estado.puntoVenta).padStart(5, "0") : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-[22px] py-[13px] text-sm">
          <dt className="text-muted">Estado de ARCA</dt>
          <dd>
            {estado.modo === "stub" ? (
              <Badge tone="warning" dot>Simulado (de prueba, sin validez fiscal)</Badge>
            ) : estado.homologacion || estado.modo === "homologacion" ? (
              <Badge tone="warning" dot>Modo de prueba (sin validez fiscal)</Badge>
            ) : (
              <Badge tone="success" dot>En línea</Badge>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-[22px] py-[13px] text-sm">
          <dt className="text-muted">Plan</dt>
          <dd className="text-strong">
            {actual.nombre} — {limite.usadas} de {limite.limite} facturas usadas este mes
            {plan.vencido && plan.vigenciaHasta && (
              <span className="block text-muted">Tu plan pago venció el {fechaCorta(plan.vigenciaHasta)}: volviste a Gratis. Tus facturas siguen todas acá.</span>
            )}
            {!plan.vencido && plan.vigenciaHasta && actual.precioMensual > 0 && (
              <span className="block text-muted">Pago hasta el {fechaCorta(plan.vigenciaHasta)}.</span>
            )}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="conectar-arca" className="mb-6 rounded-xl border border-line bg-surface-raised px-[22px] py-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="conectar-arca" className="text-sm font-semibold text-strong">Conectar con ARCA</h2>
          <Badge tone={arca.tono} dot>{arca.etiqueta}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{arca.detalle}</p>
        <Link
          href={LINK_CONECTAR_ARCA}
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-strong underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {arca.accion}
        </Link>
      </section>

      <MercadoPagoConexion tenantId={tenantId} aviso={avisoMp} />

      <DatosParaFacturas inicial={formDesdeGuardado(guardados)} completos={faltantesEmisor(guardados).length === 0} />

      <section className="rounded-xl border border-line bg-surface-sunken px-[22px] py-5">
        <h2 className="text-sm font-semibold text-strong">¿Te quedaste corto?</h2>
        {siguiente ? (
          <>
            <p className="mt-1 text-sm text-muted">
              Con <strong className="font-semibold text-strong">{siguiente.nombre}</strong> facturás hasta{" "}
              {siguiente.facturasPorMes} por mes, en esta misma app: no perdés nada de lo que ya emitiste.{" "}
              <strong className="font-semibold tabular-nums text-strong">{precioConPeriodo(siguiente.precioMensual)}</strong>, IVA
              incluido.
            </p>
            <p className="mt-2 text-sm text-muted">
              Transferí {precioTexto(siguiente.precioMensual)} al alias de Gestión Studio Grow:{" "}
              <strong className="font-semibold text-strong">{ALIAS_TRANSFERENCIA_GSG}</strong>. Mandanos el comprobante y lo
              activamos apenas lo vemos.
            </p>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <a
                href={linkCanal(
                  canal,
                  `Pasar a ${siguiente.nombre}`,
                  `¡Hola! Quiero pasar al plan ${siguiente.nombre} de Factoque (${precioTexto(siguiente.precioMensual)} por mes). Te mando el comprobante de la transferencia.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-strong underline underline-offset-4"
              >
                Pasar a {siguiente.nombre}
                {canal.tipo === "whatsapp" ? " por WhatsApp" : " por mail"}
              </a>
              <Link href="/facturita/planes" className="font-semibold text-strong underline underline-offset-4">
                Ver los planes
              </Link>
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Ya estás en el plan más grande de Factoque. Si necesitás que lo del banco y Mercado Pago se facture solo,
            eso es Comerciante, otro producto de Gestión Studio Grow: escribinos y te contamos.
          </p>
        )}
      </section>
    </>
  );
}
