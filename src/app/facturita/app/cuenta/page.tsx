// FACTURITA · Mi cuenta — los datos fiscales del emisor, el estado de ARCA y
// la tarjeta «Conectar con ARCA» (Plan de salida 11/2026 §1 #6) y el gancho de upgrade: cuando el
// negocio crece, Comerciante es activar más módulos en el MISMO espacio, sin migrar nada (ADR-076).

import { PageHeader, Badge } from "@/components/ui";
import { getFacturacion } from "@/lib/facturacion-actions";
import { datosParaFacturasAction, estadoFacturitaAction } from "@/lib/facturita-actions";
import { faltantesEmisor, formDesdeGuardado } from "@/lib/facturita-emisor";
import DatosParaFacturas from "./DatosParaFacturas";
import MercadoPagoConexion from "./MercadoPagoConexion";
import { sesionFacturita } from "@/lib/facturita-sesion.server";
import Link from "next/link";
import { ESTADO_PRECIOS, PLAN_SALTO, precioConPeriodo } from "@/lib/facturita-planes";
import { LINK_CONECTAR_ARCA } from "@/lib/facturita-core";
import { estadoConexionArca } from "@/lib/facturita-arca";
import { leerFichaDelPase } from "@/lib/operador/pase-a-real.server";
import { modoDesdeEnv } from "@/plugins/arca";

export const dynamic = "force-dynamic";

function cuitConGuiones(cuit: string | null): string {
  if (!cuit || cuit.length !== 11) return cuit ?? "—";
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

export default async function FacturitaCuentaPage({ searchParams }: { searchParams: Promise<{ mp?: string | string[] }> }) {
  const [{ estado }, limite, guardados, { tenantId }, q] = await Promise.all([
    getFacturacion(),
    estadoFacturitaAction(),
    datosParaFacturasAction(),
    sesionFacturita(),
    searchParams,
  ]);
  const avisoMp = typeof q.mp === "string" ? q.mp : undefined;
  // La ficha del pase se lee con el tenantId de la SESIÓN (nunca de la URL): sólo el propio negocio.
  const arca = estadoConexionArca(await leerFichaDelPase(tenantId, modoDesdeEnv()).catch(() => null));

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
            Gratis — {limite.usadas} de {limite.limite} facturas usadas este mes
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
        <p className="mt-1 text-sm text-muted">
          Con <strong className="font-semibold text-strong">Comerciante</strong> facturás hasta {PLAN_SALTO.facturasPorMes} por mes y,
          mejor todavía: subís el extracto del banco o conectás Mercado Pago y las facturas se arman
          solas. Es el mismo espacio, con más músculo — no perdés nada de lo que ya emitiste.
        </p>
        <p className="mt-2 text-sm text-muted">
          {PLAN_SALTO.nombre} arranca en{" "}
          <strong className="font-semibold tabular-nums text-strong">{precioConPeriodo(PLAN_SALTO.precioMensual)}</strong>{" "}
          ({ESTADO_PRECIOS.toLowerCase()}). Escribinos y lo activamos.{" "}
          <Link href="/facturita/planes" className="font-semibold text-strong underline underline-offset-4">
            Ver los planes
          </Link>
        </p>
      </section>
    </>
  );
}
