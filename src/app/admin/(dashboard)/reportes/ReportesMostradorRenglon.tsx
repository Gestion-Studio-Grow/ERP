// REPORTES DE UN MOSTRADOR, DISEÑO NUEVO («Renglón») — sólo con el interruptor «Diseño nuevo».
//
// Los mismos números que la pantalla de siempre (`leerVentasMostrador`, el mismo `r`), leídos de
// otra forma: en vez de una pared de 90 renglones por día, dos gráficos que contestan las dos
// preguntas del dueño —«¿cómo vino el período?» (la tira) y «¿qué día se vende más?» (la semana
// tipo)— y abajo los medios de cobro y los productos con una raya del largo de lo que vendieron.
// El detalle por día sigue estando, plegado. Nada de acá calcula plata: reparte los totales por
// día que ya trae el reporte (`tira-core.ts`, con tests).

import Link from "next/link";
import type { ReporteMostrador } from "@/lib/reports/ventas-mostrador";
import { cantidadLegible } from "@/lib/reports/ventas-mostrador";
import { opcionesDePeriodo, type PeriodoReporte } from "@/lib/report-periodo";
import { diaMas } from "@/lib/report-ingresos";
import { fmtShortDate } from "@/lib/datetime";
import { Bloque, DosColumnas, EmptyState, PageHeader, Plata, Renglon, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { armarSemanaTipo, armarTira, diaConNombre, porcentajeLegible, proporcion, unDecimal } from "./tira-core";
import { ContraAnterior } from "./ContraAnterior";
import { GraficoTira, NOMBRE_UNIDAD } from "./GraficoTira";

const money = (n: number) => fmtMoneyARS(n, 0);
const TOPE_PRODUCTOS = 25;

/** Una raya del largo de lo que representa (0 a 1). Decorativa: el número está al lado. */
function Raya({ largo, destacada = false }: { largo: number; destacada?: boolean }) {
  return (
    <span aria-hidden="true" className="mb-1 mt-1.5 block h-1.5 w-full max-w-[28rem] bg-bar-track">
      <span className={cn("block h-full", destacada ? "bg-accent" : "bg-strong")} style={{ width: `${Math.round(largo * 1000) / 10}%` }} />
    </span>
  );
}

export default function ReportesMostradorRenglon({
  r,
  periodo,
  hoy,
  totalAnterior,
  abribles,
  reporteDelRubro = false,
}: {
  r: ReporteMostrador & { desde: Date; hasta: Date };
  periodo: PeriodoReporte;
  hoy: string;
  totalAnterior: number;
  abribles: ReadonlySet<string>;
  /** Magra T7: el link «Reporte de la carnicería», sólo para el rubro con perecederos. */
  reporteDelRubro?: boolean;
}) {
  const tira = armarTira(r.porDia, periodo.ultimoDia, periodo.dias, { cerrado: periodo.cerrado });
  // La semana tipo deja afuera el último día porque es hoy y no terminó. En un período cerrado sí
  // terminó: se le suma un día de más, sin ventas, para que el que quede afuera sea ése.
  const semana = periodo.cerrado
    ? armarSemanaTipo(r.porDia, diaMas(periodo.ultimoDia, 1), periodo.dias + 1)
    : armarSemanaTipo(r.porDia, periodo.ultimoDia, periodo.dias);
  const u = NOMBRE_UNIDAD[tira.unidad];
  const sumaMedios = r.porMedio.reduce((s, m) => s + m.total, 0);
  const topeProducto = r.porProducto[0]?.total ?? 0;
  const productos = r.porProducto.slice(0, TOPE_PRODUCTOS);
  const exportar = (
    <a href={`/admin/reportes/export?${periodo.query}`} className={cn(buttonClasses("outline", "md"), "min-h-11")}>
      Exportar CSV
    </a>
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Reportes"
        estado={[
          `Del ${fmtShortDate(r.desde)} al ${fmtShortDate(r.hasta)}`,
          r.cantidad > 0 ? (
            <>
              <strong className="font-semibold text-strong tabular-nums">{money(r.total)}</strong> cobrado
            </>
          ) : null,
          r.cantidad > 0 ? `${fmtNumberAR(r.cantidad)} ${r.cantidad === 1 ? "venta" : "ventas"}` : null,
          r.cantidad > 0 ? `ticket promedio ${money(r.ticketPromedio)}` : null,
        ]}
        actions={exportar}
      />
      {r.cantidad > 0 && <ContraAnterior actual={r.total} anterior={totalAnterior} periodo={periodo} />}

      <nav aria-label="Período" className="mb-6 mt-3 flex flex-wrap gap-x-1 border-b border-line">
        {opcionesDePeriodo(hoy).map((p) => {
          const activo = p.query === periodo.query;
          return (
            <Link
              key={p.query}
              href={`/admin/reportes?${p.query}`}
              aria-current={activo ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm",
                activo ? "border-accent font-semibold text-strong" : "border-transparent text-muted hover:text-strong",
              )}
            >
              {p.etiqueta}
            </Link>
          );
        })}
      </nav>

      {reporteDelRubro && (
        <p className="mb-6 text-sm">
          <Link href="/admin/reportes/carniceria" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-strong">
            Reporte de la carnicería
          </Link>
        </p>
      )}

      {r.cantidad === 0 ? (
        <EmptyState
          title="Sin ventas cobradas en el período"
          description="Cuando se cobren ventas en el mostrador, acá vas a ver cómo vino cada semana, qué día se vende más, cómo te pagaron y qué se llevó la gente."
          action={
            abribles.has("vender") ? (
              <Link href="/admin/vender" className={buttonClasses("solid", "md")}>
                Ir a Vender
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-10">
          <Bloque
            id="tira"
            titulo="Cómo vino el período"
            nota={tira.mejor ? `${u.mejor}: ${tira.mejor.etiqueta} · ${money(tira.mejor.total)}` : undefined}
          >
            <GraficoTira tira={tira} que="vendido" cada={{ uno: "venta", varios: "ventas" }} />
            {(abribles.has("resultado-del-mes") || abribles.has("flujo-de-fondos") || abribles.has("margen")) && (
              <p className="mt-3 flex flex-wrap gap-x-4 text-sm">
                {abribles.has("resultado-del-mes") && (
                  <Link href="/admin/resultado" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-strong">
                    ¿Cuánto dejó? Resultado del mes
                  </Link>
                )}
                {abribles.has("flujo-de-fondos") && (
                  <Link href="/admin/flujo" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-strong">
                    Flujo de fondos
                  </Link>
                )}
                {abribles.has("margen") && (
                  <Link href="/admin/reportes/margen" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-strong">
                    Margen por producto
                  </Link>
                )}
              </p>
            )}
          </Bloque>

          <DosColumnas>
            <Bloque
              id="semana-tipo"
              titulo="Qué día se vende más"
              nota={semana.desde ? `Promedio desde el ${diaConNombre(semana.desde)}${periodo.cerrado ? "" : ", sin hoy"}` : undefined}
            >
              {semana.dias.map((d, i) => (
                <Renglon
                  key={d.nombre}
                  folio={<span className={semana.mejor === i ? "font-semibold text-strong" : undefined}>{d.nombre}</span>}
                  titulo={
                    <>
                      <Raya largo={d.proporcion} destacada={semana.mejor === i} />
                      <span className="sr-only">{d.nombre}: </span>
                      {semana.mejor === i && <span className="sr-only">el que más vende. </span>}
                    </>
                  }
                  detalle={
                    d.ocurrencias === 0
                      ? "Todavía no hubo ninguno en el período"
                      : `${unDecimal(d.ventasPromedio)} ventas por día · ${d.ocurrencias} ${d.ocurrencias === 1 ? "día contado" : "días contados"}${semana.mejor === i ? " · el que más vende" : ""}`
                  }
                  plata={<Plata valor={d.promedio} sinCentavos />}
                />
              ))}
            </Bloque>

            <Bloque id="medios" titulo="Cómo te pagaron" cuenta={`${r.porMedio.length} ${r.porMedio.length === 1 ? "medio" : "medios"}`}>
              {r.porMedio.map((m) => (
                <Renglon
                  key={m.medio}
                  folio={<span className="tabular-nums">{porcentajeLegible(m.total, sumaMedios)}</span>}
                  titulo={m.etiqueta}
                  detalle={
                    <>
                      <Raya largo={proporcion(m.total, sumaMedios)} />
                      {fmtNumberAR(m.cantidad)} {m.cantidad === 1 ? "venta" : "ventas"}
                    </>
                  }
                  plata={<Plata valor={m.total} sinCentavos />}
                />
              ))}
            </Bloque>
          </DosColumnas>

          <Bloque
            id="productos"
            titulo="Lo que más se vendió"
            cuenta={r.porProducto.length > TOPE_PRODUCTOS ? `los ${TOPE_PRODUCTOS} primeros de ${fmtNumberAR(r.porProducto.length)}` : fmtNumberAR(r.porProducto.length)}
            nota="Antes del descuento de cada venta · el CSV trae todos"
          >
            <ol>
              {productos.map((p, i) => (
                <Renglon
                  key={p.clave}
                  as="li"
                  folio={<span className="tabular-nums">{i + 1}</span>}
                  titulo={p.nombre}
                  detalle={
                    <>
                      <Raya largo={proporcion(p.total, topeProducto)} />
                      {cantidadLegible(p.cantidad, p.porKilo)}
                    </>
                  }
                  plata={<Plata valor={p.total} sinCentavos />}
                />
              ))}
            </ol>
          </Bloque>

          <details className="group">
            <summary className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-line-strong text-[15px] font-semibold text-strong">
              Día por día
              <span className="text-[13px] font-normal text-muted">
                {fmtNumberAR(r.porDia.length)} {r.porDia.length === 1 ? "día con ventas" : "días con ventas"} · el día del negocio en que se cobró
              </span>
            </summary>
            <ol>
              {r.porDia.map((d) => (
                <Renglon
                  key={d.dia}
                  as="li"
                  folio={<span className="tabular-nums">{diaConNombre(d.dia)}</span>}
                  titulo={`${fmtNumberAR(d.cantidad)} ${d.cantidad === 1 ? "venta" : "ventas"}`}
                  plata={<Plata valor={d.total} sinCentavos />}
                />
              ))}
            </ol>
          </details>
        </div>
      )}
    </main>
  );
}
