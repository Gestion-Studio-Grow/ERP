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
import { REPORT_RANGE_DAYS } from "@/lib/report-config";
import { fmtShortDate } from "@/lib/datetime";
import { Bloque, DosColumnas, EmptyState, PageHeader, Plata, Renglon, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { armarSemanaTipo, armarTira, diaConNombre, porcentajeLegible, proporcion, unDecimal, type Tira, type Unidad } from "./tira-core";

const money = (n: number) => fmtMoneyARS(n, 0);
const TOPE_PRODUCTOS = 25;

const NOMBRE_UNIDAD: Record<Unidad, { una: string; mejor: string; hueco: string }> = {
  dia: { una: "día", mejor: "Mejor día", hueco: "El palo hueco es hoy: el día todavía no terminó." },
  semana: {
    una: "semana",
    mejor: "Mejor semana",
    hueco: "Los palos huecos son semanas incompletas: la de hoy y, si el período arranca a mitad de semana, la primera.",
  },
  mes: { una: "mes", mejor: "Mejor mes", hueco: "Los palos huecos son meses incompletos: el de hoy y el primero del período." },
};

/** Una raya del largo de lo que representa (0 a 1). Decorativa: el número está al lado. */
function Raya({ largo, destacada = false }: { largo: number; destacada?: boolean }) {
  return (
    <span aria-hidden="true" className="mb-1 mt-1.5 block h-1.5 w-full max-w-[28rem] bg-bar-track">
      <span className={cn("block h-full", destacada ? "bg-accent" : "bg-strong")} style={{ width: `${Math.round(largo * 1000) / 10}%` }} />
    </span>
  );
}

/** La tira: un palo por tramo; los incompletos, huecos. El tope del gráfico dice cuánto vale. */
function GraficoTira({ tira }: { tira: Tira }) {
  const n = tira.tramos.length;
  const tope = Math.max(0, ...tira.tramos.map((t) => t.total));
  const paso = Math.max(1, Math.ceil(n / 6));
  const u = NOMBRE_UNIDAD[tira.unidad];
  return (
    <figure className="mt-3">
      <p className="flex items-baseline justify-between text-xs text-muted">
        <span className="tabular-nums">{money(tope)}</span>
        <span>por {u.una}</span>
      </p>
      <ol
        aria-label={`Lo vendido por ${u.una}, del más viejo al de hoy`}
        className="mt-1 flex h-40 items-end gap-[3px] border-b border-t border-dashed border-b-line-strong border-t-line sm:h-48"
      >
        {tira.tramos.map((t) => {
          const esMejor = tira.mejor?.desde === t.desde;
          const alto = t.total > 0 ? Math.max(t.alto * 100, 1.5) : 0;
          const estado = t.enCurso ? " (en curso)" : t.parcial ? " (incompleta)" : "";
          return (
            <li key={t.desde} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${t.etiqueta}: ${money(t.total)} · ${fmtNumberAR(t.cantidad)} ventas${estado}`}>
              <span
                aria-hidden="true"
                className={cn(
                  "mx-auto block w-4/5 max-w-12",
                  t.total <= 0 ? "" : t.parcial ? "border-2 border-b-0 border-strong" : esMejor ? "bg-accent" : "bg-strong",
                )}
                style={{ height: `${alto}%` }}
              />
              <span className="sr-only">
                {t.etiqueta}: {money(t.total)}, {fmtNumberAR(t.cantidad)} ventas{estado}
                {esMejor ? `. ${u.mejor}.` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <div aria-hidden="true" className="mt-1 flex gap-[3px] text-[11px] text-muted">
        {tira.tramos.map((t, i) => (
          <span key={t.desde} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {i % paso === 0 || i === n - 1 ? (i === n - 1 ? "hoy" : t.corta) : ""}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-muted">{u.hueco}</figcaption>
    </figure>
  );
}

export default function ReportesMostradorRenglon({
  r,
  hoy,
  rangeDays,
  abribles,
}: {
  r: ReporteMostrador & { desde: Date; hasta: Date };
  hoy: string;
  rangeDays: number;
  abribles: ReadonlySet<string>;
}) {
  const tira = armarTira(r.porDia, hoy, rangeDays);
  const semana = armarSemanaTipo(r.porDia, hoy, rangeDays);
  const u = NOMBRE_UNIDAD[tira.unidad];
  const sumaMedios = r.porMedio.reduce((s, m) => s + m.total, 0);
  const topeProducto = r.porProducto[0]?.total ?? 0;
  const productos = r.porProducto.slice(0, TOPE_PRODUCTOS);
  const exportar = (
    <a href={`/admin/reportes/export?dias=${rangeDays}`} className={cn(buttonClasses("outline", "md"), "min-h-11")}>
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

      <nav aria-label="Período" className="mb-6 mt-3 flex flex-wrap gap-x-1 border-b border-line">
        {REPORT_RANGE_DAYS.map((d) => {
          const activo = d === rangeDays;
          return (
            <Link
              key={d}
              href={`/admin/reportes?dias=${d}`}
              aria-current={activo ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm",
                activo ? "border-accent font-semibold text-strong" : "border-transparent text-muted hover:text-strong",
              )}
            >
              {d === 365 ? "1 año" : `${d} días`}
            </Link>
          );
        })}
      </nav>

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
            <GraficoTira tira={tira} />
            {(abribles.has("resultado-del-mes") || abribles.has("margen")) && (
              <p className="mt-3 flex flex-wrap gap-x-4 text-sm">
                {abribles.has("resultado-del-mes") && (
                  <Link href="/admin/resultado" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-strong">
                    ¿Cuánto dejó? Resultado del mes
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
              nota={semana.desde ? `Promedio desde el ${diaConNombre(semana.desde)}, sin hoy` : undefined}
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
