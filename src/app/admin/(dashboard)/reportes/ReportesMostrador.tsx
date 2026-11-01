// REPORTES DE UN LOCAL DE MOSTRADOR — las ventas cobradas del período, por día, medio y
// producto.
//
// Reportes medía sólo los cobros de TURNOS: en una carnicería, una velería o una tienda de
// pádel daba $0 con el local vendiendo todo el día, y el botón del Inicio decía "— Las ventas
// del mostrador se ven en el libro de caja". En un mostrador, esta es la pantalla de Reportes.
//
// EL MISMO RELOJ que Ventas del día: una venta cuenta el día del negocio en que se creó y se
// cobró, dentro de los bordes de día del período de Reportes (`leerVentasMostrador`). El
// número del botón del Inicio sale del mismo `where`.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { fmtShortDate } from "@/lib/datetime";
import type { Role } from "@/lib/capabilities";
import { opcionesDePeriodo, type PeriodoReporte } from "@/lib/report-periodo";
import { leerTotalDelPeriodo, leerVentasMostrador } from "@/lib/reports/ventas-mostrador-lectura";
import { cantidadLegible } from "@/lib/reports/ventas-mostrador";
import { appsQuePuedeAbrir } from "@/lib/reports/apps-a-mano.server";
import { diaLegible } from "@/lib/libros/fecha-fiscal";
import { EmptyState, PageHeader, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import ReportesMostradorRenglon from "./ReportesMostradorRenglon";
import { ContraAnterior } from "./ContraAnterior";
import { GraficoTira, NOMBRE_UNIDAD } from "./GraficoTira";
import { armarTira } from "./tira-core";

const money = (n: number) => fmtMoneyARS(n, 0);

function Tarjeta({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-strong">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {children}
    </div>
  );
}

function Lista({ titulo, hint, filas }: { titulo: string; hint?: string; filas: { clave: string; izq: React.ReactNode; der: string }[] }) {
  return (
    <section className="rounded-lg border border-line p-4">
      <h3 className="mb-1 font-medium text-strong">{titulo}</h3>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      <div className="space-y-1.5">
        {filas.map((f) => (
          <div key={f.clave} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 text-muted">{f.izq}</span>
            <span className="whitespace-nowrap font-medium tabular-nums">{f.der}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function ReportesMostrador({ periodo, hoy, role }: { periodo: PeriodoReporte; hoy: string; role: Role }) {
  const tenantId = await getCurrentTenantId();
  const [r, totalAnterior, abribles, nuevo] = await Promise.all([
    leerVentasMostrador(prisma, tenantId, periodo.ultimoDia, periodo.dias),
    leerTotalDelPeriodo(prisma, tenantId, periodo.anterior.ultimoDia, periodo.anterior.dias),
    appsQuePuedeAbrir(role, ["resultado-del-mes", "flujo-de-fondos", "margen", "vender", "ventas-del-dia"]),
    disenoNuevo(),
  ]);
  // Diseño nuevo («Renglón»): los mismos datos, con la tira y la semana tipo. Apagado, igual que siempre.
  if (nuevo) return <ReportesMostradorRenglon r={r} periodo={periodo} hoy={hoy} totalAnterior={totalAnterior} abribles={abribles} />;
  const TOPE_PRODUCTOS = 25;
  const tira = armarTira(r.porDia, periodo.ultimoDia, periodo.dias, { cerrado: periodo.cerrado });

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Reportes"
        description={`Ventas cobradas del mostrador, por día del negocio · del ${fmtShortDate(r.desde)} al ${fmtShortDate(r.hasta)}. Las anuladas no cuentan.`}
      />

      {/* Período (ADR-023 F3): el reporte se acota a un rango, igual que en servicios. */}
      <nav aria-label="Período" className="mb-6 flex flex-wrap items-center gap-2">
        {opcionesDePeriodo(hoy).map((p) => {
          const activo = p.query === periodo.query;
          return (
            <Link
              key={p.query}
              href={`/admin/reportes?${p.query}`}
              aria-current={activo ? "page" : undefined}
              className={`inline-flex h-11 items-center rounded-md border px-3 text-sm transition-colors ${
                activo ? "border-line-strong bg-surface-raised font-medium text-strong" : "border-line text-muted hover:border-line-strong"
              }`}
            >
              {p.etiqueta}
            </Link>
          );
        })}
        <a
          href={`/admin/reportes/export?${periodo.query}`}
          className="ml-auto inline-flex h-11 items-center rounded-md border border-line px-3 text-sm text-muted transition-colors hover:border-line-strong hover:text-strong"
        >
          ↓ Exportar CSV
        </a>
      </nav>

      {r.cantidad === 0 ? (
        <EmptyState
          title="Sin ventas cobradas en el período"
          description={
            abribles.has("vender")
              ? "Cuando cobres ventas en el mostrador, acá vas a ver cuánto vendiste por día, por medio de cobro y por producto."
              : "Cuando se cobren ventas en el mostrador, acá vas a ver cuánto se vendió por día, por medio de cobro y por producto."
          }
          action={
            abribles.has("vender") ? (
              <Link href="/admin/vender" className={buttonClasses("solid", "md")}>
                Ir a Vender
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Tarjeta label="Vendido y cobrado" value={money(r.total)} hint="Después del descuento de cada venta">
              <ContraAnterior actual={r.total} anterior={totalAnterior} periodo={periodo} />
            </Tarjeta>
            <Tarjeta label="Ventas" value={fmtNumberAR(r.cantidad)} />
            <Tarjeta label="Ticket promedio" value={money(r.ticketPromedio)} />
          </div>

          <section aria-labelledby="tira-titulo" className="mb-6 rounded-lg border border-line p-4">
            <h2 id="tira-titulo" className="font-medium text-strong">Cómo vino el período</h2>
            {tira.mejor && (
              <p className="mt-1 text-xs text-muted">
                {NOMBRE_UNIDAD[tira.unidad].mejor}: {tira.mejor.etiqueta} · {money(tira.mejor.total)}
              </p>
            )}
            <GraficoTira tira={tira} que="vendido" cada={{ uno: "venta", varios: "ventas" }} />
          </section>

          {(abribles.has("resultado-del-mes") || abribles.has("flujo-de-fondos") || abribles.has("margen")) && (
            <p className="mb-6 flex flex-wrap gap-2">
              {abribles.has("resultado-del-mes") && (
                <Link href="/admin/resultado" className={buttonClasses("outline", "md")}>
                  ¿Cuánto dejó? Resultado del mes
                </Link>
              )}
              {abribles.has("flujo-de-fondos") && (
                <Link href="/admin/flujo" className={buttonClasses("outline", "md")}>
                  Flujo de fondos
                </Link>
              )}
              {abribles.has("margen") && (
                <Link href="/admin/reportes/margen" className={buttonClasses("outline", "md")}>
                  Margen por producto
                </Link>
              )}
            </p>
          )}

          <div className="grid gap-4">
            <Lista
              titulo="Por medio de cobro"
              filas={r.porMedio.map((m) => ({
                clave: m.medio,
                izq: (
                  <>
                    {m.etiqueta} <span className="text-xs">({fmtNumberAR(m.cantidad)})</span>
                  </>
                ),
                der: money(m.total),
              }))}
            />
            <Lista
              titulo={r.porProducto.length > TOPE_PRODUCTOS ? `Por producto (los ${TOPE_PRODUCTOS} que más vendieron)` : "Por producto"}
              hint="Lo cobrado por cada línea, antes del descuento de la venta. El CSV trae todos."
              filas={r.porProducto.slice(0, TOPE_PRODUCTOS).map((p) => ({
                clave: p.clave,
                izq: (
                  <>
                    {p.nombre} <span className="text-xs">· {cantidadLegible(p.cantidad, p.porKilo)}</span>
                  </>
                ),
                der: money(p.total),
              }))}
            />
            {/* El día por día, plegado: el gráfico de arriba ya cuenta cómo vino el período. */}
            <details className="rounded-lg border border-line p-4">
              <summary className="flex min-h-11 cursor-pointer items-center gap-3 font-medium text-strong">
                Día por día
                <span className="text-xs font-normal text-muted">
                  {fmtNumberAR(r.porDia.length)} {r.porDia.length === 1 ? "día con ventas" : "días con ventas"}
                </span>
              </summary>
              <p className="mb-3 mt-2 text-xs text-muted">El día del negocio en que se cobró.</p>
              <div className="space-y-1.5">
                {r.porDia.map((d) => (
                  <div key={d.dia} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 text-muted">
                      {diaLegible(d.dia)} <span className="text-xs">({fmtNumberAR(d.cantidad)} {d.cantidad === 1 ? "venta" : "ventas"})</span>
                    </span>
                    <span className="whitespace-nowrap font-medium tabular-nums">{money(d.total)}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </>
      )}
    </main>
  );
}
