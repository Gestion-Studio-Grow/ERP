import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { permisoEfectivo } from "@/lib/capabilities";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { migracionCarniceriaAplicada } from "@/lib/carniceria/schema-probe";
import { listarLotes } from "@/lib/carniceria/lotes-loader";
import { listarDespieces } from "@/lib/carniceria/despiece-loader";
import { fmtDia, plataEnRiesgo } from "@/lib/carniceria/lotes";
import { leerKilosVendidos } from "@/lib/carniceria/reporte-rubro-loader";
import {
  kilosPorCorte,
  mermaPorVencimiento,
  mesesDelReporte,
  muestraReporteDelRubro,
  rendimientoDelDespiece,
} from "@/lib/carniceria/reporte-rubro";
import { pluralDe } from "@/apps/kpis/nucleo.server";
import { PageHeader, fmtMoneyARS, fmtNumberAR } from "@/components/ui";

export const dynamic = "force-dynamic";

const kg = (n: number) => `${fmtNumberAR(n, 1)} kg`;
const pct = (f: number) => `${fmtNumberAR(f * 100, 1)} %`;
const variacion = (v: number | null) => (v == null ? "nuevo" : `${v > 0 ? "+" : ""}${fmtNumberAR(v * 100, 0)} %`);
const money = (n: number) => fmtMoneyARS(n, 0);

const SIN_MIGRACION = "Se activa con la actualización de la base.";

// REPORTE DE LA CARNICERÍA (Magra T7). Sólo para el rubro que vende perecederos; cualquier otro
// negocio (CH incluido) recibe 404. Los kilos vendidos salen de las ventas y se ven siempre; el
// despiece y la merma por vencimiento leen tablas de la migración cárnica: sin ella, avisan.
export default async function ReporteCarniceriaPage() {
  const user = await requireApp("reportes");
  const negocio = await getCurrentTenantRubro();
  if (!muestraReporteDelRubro(negocio.rubro?.id)) notFound();

  const conCostos = permisoEfectivo(user, "costs:read");
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const meses = mesesDelReporte(hoy);
  const uno = negocio.rubro?.wording.itemNoun?.trim() || "producto";
  const varios = pluralDe(uno);

  const [vendidoAhora, vendidoAntes, migrada] = await Promise.all([
    leerKilosVendidos(prisma, tenantId, meses.actual),
    leerKilosVendidos(prisma, tenantId, meses.anterior),
    migracionCarniceriaAplicada(),
  ]);
  const [lotes, corridas] = migrada ? await Promise.all([listarLotes(tenantId, conCostos), listarDespieces(tenantId)]) : [[], []];

  const kilos = kilosPorCorte(vendidoAhora, vendidoAntes);
  const rendimiento = rendimientoDelDespiece(corridas, meses.actual);
  const merma = mermaPorVencimiento(lotes, meses.actual, hoy);
  const riesgo = plataEnRiesgo(lotes, hoy);
  const periodo = `del ${fmtDia(meses.actual.desde)} a hoy, contra el mes anterior`;

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader title="Reporte de la carnicería" description={`Kilos vendidos, rendimiento del despiece y lo que se perdió por vencimiento · ${periodo}.`} />
      <p className="mb-6">
        <Link href="/admin/reportes" className="text-sm underline underline-offset-2">
          Volver a Reportes
        </Link>
      </p>

      <section aria-labelledby="kilos-titulo" className="mb-8">
        <h2 id="kilos-titulo" className="mb-1 font-medium text-strong">
          Kilos vendidos por {uno}
        </h2>
        <p className="mb-3 text-sm text-muted">
          Este mes: {kg(kilos.totalKg)} · mes anterior: {kg(kilos.totalKgAnterior)}. Las ventas anuladas no cuentan.
        </p>
        {kilos.filas.length === 0 ? (
          <p className="text-sm text-body">Todavía no hay {varios} vendidos por peso este mes.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Los {kilos.filas.length} {varios} con más kilos vendidos este mes</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-2 font-medium">{uno.charAt(0).toUpperCase() + uno.slice(1)}</th>
                <th scope="col" className="py-2 text-right font-medium">Kilos</th>
                <th scope="col" className="py-2 text-right font-medium">Del total</th>
                <th scope="col" className="py-2 text-right font-medium">Mes anterior</th>
                <th scope="col" className="py-2 text-right font-medium">Variación</th>
              </tr>
            </thead>
            <tbody>
              {kilos.filas.map((f) => (
                <tr key={f.clave} className="border-b border-line">
                  <th scope="row" className="py-2 text-left font-normal">{f.nombre}</th>
                  <td className="py-2 text-right tabular-nums">{kg(f.kg)}</td>
                  <td className="py-2 text-right tabular-nums">{pct(f.delTotal)}</td>
                  <td className="py-2 text-right tabular-nums">{kg(f.kgAnterior)}</td>
                  <td className="py-2 text-right tabular-nums">{variacion(f.variacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="despiece-titulo" className="mb-8">
        <h2 id="despiece-titulo" className="mb-1 font-medium text-strong">
          Rendimiento del despiece
        </h2>
        {!migrada ? (
          <p className="text-sm text-body">{SIN_MIGRACION}</p>
        ) : rendimiento.length === 0 ? (
          <p className="text-sm text-body">Este mes todavía no registraste ningún despiece.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">Promedio por pieza de origen, ponderado por los kilos que entraron.</p>
            <table className="w-full text-sm">
              <caption className="sr-only">Rendimiento y merma del despiece de este mes, por pieza de origen</caption>
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th scope="col" className="py-2 font-medium">Pieza de origen</th>
                  <th scope="col" className="py-2 text-right font-medium">Despieces</th>
                  <th scope="col" className="py-2 text-right font-medium">Entraron</th>
                  <th scope="col" className="py-2 text-right font-medium">Rendimiento</th>
                  <th scope="col" className="py-2 text-right font-medium">Merma</th>
                </tr>
              </thead>
              <tbody>
                {rendimiento.map((r) => (
                  <tr key={r.origen} className="border-b border-line">
                    <th scope="row" className="py-2 text-left font-normal">{r.origen}</th>
                    <td className="py-2 text-right tabular-nums">{fmtNumberAR(r.corridas)}</td>
                    <td className="py-2 text-right tabular-nums">{kg(r.kgEntrada)}</td>
                    <td className="py-2 text-right tabular-nums">{pct(r.rendimiento)}</td>
                    <td className="py-2 text-right tabular-nums">{pct(r.merma)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section aria-labelledby="merma-titulo" className="mb-8">
        <h2 id="merma-titulo" className="mb-1 font-medium text-strong">
          Lo que se perdió por vencimiento
        </h2>
        {!migrada ? (
          <p className="text-sm text-body">{SIN_MIGRACION}</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              Este mes: {kg(merma.kg)}
              {conCostos ? ` · ${money(merma.pesos)}${merma.sinCosto > 0 ? ` (${fmtNumberAR(merma.sinCosto)} sin costo)` : ""}` : ""}.
              {conCostos && riesgo.lotes > 0
                ? ` Hoy hay ${money(riesgo.pesos)} en riesgo en ${fmtNumberAR(riesgo.lotes)} ${riesgo.lotes === 1 ? "lote vencido o por vencer" : "lotes vencidos o por vencer"}${riesgo.sinCosto > 0 ? ` (${fmtNumberAR(riesgo.sinCosto)} sin costo)` : ""}.`
                : ""}
            </p>
            {merma.lotes.length === 0 ? (
              <p className="text-sm text-body">Este mes no se venció ni se retiró ningún lote.</p>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Lotes vencidos o retirados este mes</caption>
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th scope="col" className="py-2 font-medium">Lote</th>
                    <th scope="col" className="py-2 font-medium">{uno.charAt(0).toUpperCase() + uno.slice(1)}</th>
                    <th scope="col" className="py-2 font-medium">Venció</th>
                    <th scope="col" className="py-2 font-medium">Estado</th>
                    <th scope="col" className="py-2 text-right font-medium">Kilos</th>
                    {conCostos && <th scope="col" className="py-2 text-right font-medium">Costo</th>}
                  </tr>
                </thead>
                <tbody>
                  {merma.lotes.map((l) => (
                    <tr key={l.id} className="border-b border-line">
                      <th scope="row" className="py-2 text-left font-normal">{l.code}</th>
                      <td className="py-2">{l.productName}</td>
                      <td className="py-2">{fmtDia(l.vence)}</td>
                      <td className="py-2">{l.motivo === "retirado" ? "Retirado" : "Vencido"}</td>
                      <td className="py-2 text-right tabular-nums">{kg(l.kg)}</td>
                      {conCostos && <td className="py-2 text-right tabular-nums">{l.pesos == null ? "sin costo" : money(l.pesos)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </main>
  );
}
