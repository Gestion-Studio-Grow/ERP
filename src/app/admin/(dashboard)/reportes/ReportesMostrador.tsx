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
import { fmtShortDate, todayInBusinessTz } from "@/lib/datetime";
import type { Role } from "@/lib/capabilities";
import { REPORT_RANGE_DAYS } from "@/lib/report-config";
import { leerVentasMostrador } from "@/lib/reports/ventas-mostrador-lectura";
import { cantidadLegible } from "@/lib/reports/ventas-mostrador";
import { appsQuePuedeAbrir } from "@/lib/reports/apps-a-mano.server";
import { diaLegible } from "@/lib/libros/fecha-fiscal";
import { EmptyState, PageHeader, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import ReportesMostradorRenglon from "./ReportesMostradorRenglon";

const money = (n: number) => fmtMoneyARS(n, 0);

function Tarjeta({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-strong">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
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

export default async function ReportesMostrador({ rangeDays, role }: { rangeDays: number; role: Role }) {
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const [r, abribles, nuevo] = await Promise.all([
    leerVentasMostrador(prisma, tenantId, hoy, rangeDays),
    appsQuePuedeAbrir(role, ["resultado-del-mes", "margen", "vender", "ventas-del-dia"]),
    disenoNuevo(),
  ]);
  // Diseño nuevo («Renglón»): los mismos datos, con la tira y la semana tipo. Apagado, igual que siempre.
  if (nuevo) return <ReportesMostradorRenglon r={r} hoy={hoy} rangeDays={rangeDays} abribles={abribles} />;
  const TOPE_PRODUCTOS = 25;

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Reportes"
        description={`Ventas cobradas del mostrador, por día del negocio · del ${fmtShortDate(r.desde)} al ${fmtShortDate(r.hasta)}. Las anuladas no cuentan.`}
      />

      {/* Período (ADR-023 F3): el reporte se acota a un rango, igual que en servicios. */}
      <nav aria-label="Período" className="mb-6 flex flex-wrap items-center gap-2">
        {REPORT_RANGE_DAYS.map((d) => {
          const activo = d === rangeDays;
          return (
            <Link
              key={d}
              href={`/admin/reportes?dias=${d}`}
              aria-current={activo ? "page" : undefined}
              className={`inline-flex h-11 items-center rounded-md border px-3 text-sm transition-colors ${
                activo ? "border-line-strong bg-surface-raised font-medium text-strong" : "border-line text-muted hover:border-line-strong"
              }`}
            >
              {d === 365 ? "1 año" : `${d} días`}
            </Link>
          );
        })}
        <a
          href={`/admin/reportes/export?dias=${rangeDays}`}
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
            <Tarjeta label="Vendido y cobrado" value={money(r.total)} hint="Después del descuento de cada venta" />
            <Tarjeta label="Ventas" value={fmtNumberAR(r.cantidad)} />
            <Tarjeta label="Ticket promedio" value={money(r.ticketPromedio)} />
          </div>

          {(abribles.has("resultado-del-mes") || abribles.has("margen")) && (
            <p className="mb-6 flex flex-wrap gap-2">
              {abribles.has("resultado-del-mes") && (
                <Link href="/admin/resultado" className={buttonClasses("outline", "md")}>
                  ¿Cuánto dejó? Resultado del mes
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
              titulo="Por día"
              hint="El día del negocio en que se cobró."
              filas={r.porDia.map((d) => ({
                clave: d.dia,
                izq: (
                  <>
                    {diaLegible(d.dia)} <span className="text-xs">({fmtNumberAR(d.cantidad)} {d.cantidad === 1 ? "venta" : "ventas"})</span>
                  </>
                ),
                der: money(d.total),
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
          </div>
        </>
      )}
    </main>
  );
}
