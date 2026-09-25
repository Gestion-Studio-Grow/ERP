// ============================================================================
// CAJA DEL DÍA — la pantalla del diseño nuevo («Renglón»). Servidor.
// ============================================================================
//
// Lo mismo que la pantalla de siempre (el resumen del día con la aritmética del cierre, el turno de
// cajero donde hay cajón), ordenado para quien pasa el día acá:
//
//   · arriba, cuánto hay ahora POR MEDIO en una tabla chica (al abrir · entró · salió · hay ahora),
//     sólo los medios que se movieron: tres tarjetas del mismo peso con «$0» no dicen nada;
//   · las dos teclas del día: «Cerrar el día» (la principal) y «Cargar un gasto o retiro»;
//   · lo que se movió hoy, un renglón por movimiento, con su medio y su origen;
//   · el turno de cajero (fondo, esperado en efectivo, arqueo), sólo donde hay cajón.
//
// Un día ya cerrado no se pinta como un día vacío: dice que está cerrado, quién y cómo corregir.

import Link from "next/link";
import type { getCierreDiarioData } from "@/lib/cierre-diario-actions";
import type { getCajaData } from "@/lib/caja-actions";
import { expectedCash, summarizeMovements, type CashMethod, type CashMovementLike, type CashMovementType } from "@/lib/caja/cash-register";
import { CASH_METHODS, CASH_METHOD_LABEL } from "@/lib/caja/libro-caja";
import { frozenDayMessage } from "@/lib/caja/cierre-diario";
import { fmtShortDate, fmtTime } from "@/lib/datetime";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import { LineaDeEstado, Marca, Plata, Renglon, Rotulo, atributosBoton, buttonClasses } from "@/components/ui";
import { LineaDeCuenta } from "@/components/ui/LineaDeCuenta";
import { diaLargo, diaMes } from "./_renglon/fechas";
import { CargarMovimiento, CerrarTurno } from "./CargarMovimiento";
import { OpenCajaForm } from "./CajaForms";

type Dia = Awaited<ReturnType<typeof getCierreDiarioData>>;
type Turno = Awaited<ReturnType<typeof getCajaData>>;

const TIPO: Record<string, string> = {
  APERTURA: "Apertura",
  VENTA: "Venta",
  INGRESO: "Ingreso",
  EGRESO: "Gasto",
  RETIRO: "Retiro",
};
const ORIGEN: Record<string, string> = {
  manual: "cargado a mano",
  pos: "venta del mostrador",
  turno: "turno cobrado",
};
const entra = (t: string) => t === "VENTA" || t === "INGRESO";

// Sólo el efectivo tiene un «hay ahora» que se pueda contar: es el cajón. MP, transferencias y
// tarjeta van al banco sin que nadie lo anote acá, así que su saldo acumulado crece para siempre y
// sumado al cajón da un número en el que nadie puede confiar ($21 millones con $243 mil en el
// cajón). Por eso esos medios muestran sólo lo que entró y salió en el período, y el saldo
// acumulado queda en el Libro de caja. La cuenta es la misma del cierre (`preview.porMedio`).
const redondo = redondearAlCentavo;

function PorMedio({ dia }: { dia: Dia }) {
  const { preview } = dia;
  const seMovio = (m: (typeof CASH_METHODS)[number]) => {
    const x = preview.porMedio[m];
    return x.ingresos !== 0 || x.egresos !== 0;
  };
  const cajon = preview.porMedio.EFECTIVO;
  const hayCajon = cajon.opening !== 0 || seMovio("EFECTIVO");
  const otros = CASH_METHODS.filter((m) => m !== "EFECTIVO" && seMovio(m));
  const quietos = CASH_METHODS.filter((m) => (m === "EFECTIVO" ? !hayCajon : !seMovio(m)));
  const periodo = !dia.since
    ? "desde el primer movimiento"
    : dia.since === dia.day
      ? "de hoy"
      : `desde el ${diaMes(dia.since)}, el último día sin cerrar`;
  const filas = (hayCajon ? 1 : 0) + otros.length;
  return (
    <section aria-labelledby="hay-ahora">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
        <h2 id="hay-ahora" className="text-[15px] font-semibold text-strong">
          Por medio de pago
        </h2>
        <span className="text-[13px] text-muted">{periodo}</span>
      </div>
      {/* PC: una tabla chica. Celular: un renglón por medio con la cifra que importa a la derecha. */}
      <table className="w-full text-sm" aria-describedby="hay-ahora">
        <thead className="max-sm:sr-only">
          <tr className="border-b border-line">
            <th scope="col" className="py-1.5 text-left">
              <Rotulo as="span">Medio</Rotulo>
            </th>
            {["Al abrir", "Entró", "Salió"].map((t) => (
              <th key={t} scope="col" className="py-1.5 text-right max-sm:hidden">
                <Rotulo as="span">{t}</Rotulo>
              </th>
            ))}
            <th scope="col" className="py-1.5 text-right">
              <Rotulo as="span">Queda</Rotulo>
            </th>
          </tr>
        </thead>
        <tbody aria-live="polite">
          {hayCajon && (
            <tr className="border-b border-line">
              <th scope="row" className="py-2.5 pr-3 text-left font-medium text-strong">
                {CASH_METHOD_LABEL.EFECTIVO}
                <span className="block text-[13px] font-normal text-muted">
                  <span className="sm:hidden">
                    al abrir <Plata valor={cajon.opening} sinCentavos /> · entró <Plata valor={cajon.ingresos} sinCentavos /> · salió{" "}
                    <Plata valor={cajon.egresos} sinCentavos />
                    <br />
                  </span>
                  según el libro del día
                </span>
              </th>
              <td className="py-2.5 text-right max-sm:hidden">
                <Plata valor={cajon.opening} />
              </td>
              <td className="py-2.5 text-right max-sm:hidden">
                <Plata valor={cajon.ingresos} />
              </td>
              <td className="py-2.5 text-right max-sm:hidden">
                <Plata valor={cajon.egresos === 0 ? 0 : -cajon.egresos} />
              </td>
              <td className="py-2.5 text-right text-base font-semibold">
                <Plata valor={cajon.expected} />
              </td>
            </tr>
          )}
          {otros.map((m) => {
            const x = preview.porMedio[m];
            return (
              <tr key={m} className="border-b border-line">
                <th scope="row" className="py-2.5 pr-3 text-left font-medium text-strong">
                  {CASH_METHOD_LABEL[m]}
                  <span className="block text-[13px] font-normal text-muted">
                    <span className="sm:hidden">
                      entró <Plata valor={x.ingresos} sinCentavos /> · salió <Plata valor={x.egresos} sinCentavos />
                      <br />
                    </span>
                    neto, va al banco
                  </span>
                </th>
                <td className="py-2.5 text-right text-muted max-sm:hidden">
                  <span aria-label="no se cuenta">—</span>
                </td>
                <td className="py-2.5 text-right max-sm:hidden">
                  <Plata valor={x.ingresos} />
                </td>
                <td className="py-2.5 text-right max-sm:hidden">
                  <Plata valor={x.egresos === 0 ? 0 : -x.egresos} />
                </td>
                <td className="py-2.5 text-right">
                  <Plata valor={redondo(x.ingresos - x.egresos)} />
                </td>
              </tr>
            );
          })}
          {filas === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-muted">
                Todavía no se movió plata en el período.
              </td>
            </tr>
          )}
        </tbody>
        {filas > 1 && (
          <tfoot>
            <tr className="border-t-2 border-line-strong">
              <th scope="row" className="py-2.5 text-left font-semibold text-strong">
                Entró en total
              </th>
              <td className="max-sm:hidden" />
              <td className="py-2.5 text-right font-semibold max-sm:hidden">
                <Plata valor={preview.total.ingresos} />
              </td>
              <td className="py-2.5 text-right max-sm:hidden">
                <Plata valor={preview.total.egresos === 0 ? 0 : -preview.total.egresos} />
              </td>
              <td className="py-2.5 text-right font-semibold sm:hidden">
                <Plata valor={preview.total.ingresos} />
              </td>
              <td className="max-sm:hidden" />
            </tr>
          </tfoot>
        )}
      </table>
      <p className="pt-2 text-[13px] text-muted">
        {quietos.length > 0 && <>{quietos.map((m) => CASH_METHOD_LABEL[m]).join(" y ")}: sin movimientos. </>}
        El saldo acumulado de MP, transferencias y tarjeta está en el{" "}
        <Link href="/admin/caja/libro" className="font-medium text-accent-ink underline">
          Libro de caja
        </Link>
        .
      </p>
    </section>
  );
}

function MovimientosDeHoy({ dia }: { dia: Dia }) {
  const deHoy = dia.movements.filter((m) => m.day === dia.day);
  return (
    <section aria-labelledby="movimientos-hoy" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
        <h2 id="movimientos-hoy" className="text-[15px] font-semibold text-strong">
          Lo que se movió hoy
        </h2>
        <span className="text-[13px] text-muted">
          {deHoy.length === 0 ? "nada todavía" : `${deHoy.length} · en el orden en que se movió la plata`}
        </span>
      </div>
      {deHoy.length === 0 && (
        <p className="py-3 text-sm text-muted">
          Cuando cobres en el mostrador o en la agenda, aparece acá solo. Los gastos y retiros se cargan con «Cargar un gasto o retiro».
        </p>
      )}
      {deHoy.map((m) =>
        // El fondo del turno no entra ni sale: es plata que ya estaba en el cajón (el libro lo
        // cuenta en cero). Se muestra sin signo y dicho, para que no parezca un ingreso.
        m.type === "APERTURA" ? (
          <Renglon
            key={m.id}
            folio={TIPO[m.type]}
            titulo={<span className="font-normal">{m.amount === 0 ? "Turno abierto sin fondo" : m.detail || "Fondo del turno"}</span>}
            detalle={
              m.amount === 0
                ? `${CASH_METHOD_LABEL[m.method]} · el cajón del turno arrancó en $0`
                : `${CASH_METHOD_LABEL[m.method]} · no suma: ya estaba en el cajón`
            }
            plata={
              <span className="text-muted">
                <Plata valor={m.amount} />
              </span>
            }
          />
        ) : (
          <Renglon
            key={m.id}
            folio={TIPO[m.type] ?? m.type}
            titulo={<span className="font-normal">{m.detail || ORIGEN[m.origin]}</span>}
            detalle={`${CASH_METHOD_LABEL[m.method]} · ${ORIGEN[m.origin]}`}
            plata={<Plata valor={entra(m.type) ? m.amount : -m.amount} />}
          />
        ),
      )}
    </section>
  );
}

/**
 * El libro del día y el turno cuentan el efectivo desde puntos distintos: el libro arrastra todo lo
 * que quedó de antes (y lo cobrado sin turno abierto); el turno arranca en su fondo. Las dos cifras
 * convivían con el mismo nombre («en el cajón») y no coincidían. Acá sólo se DICE la diferencia; las
 * dos cuentas son las de siempre (`preview.porMedio` y `expectedCash`).
 */
function DiferenciaConElLibro({ libro, turno }: { libro: number; turno: number }) {
  const dif = redondo(libro - turno);
  if (Math.abs(dif) < 0.01) return null;
  return (
    <p role="note" className="mt-3 border-l-2 border-line-strong pl-3 text-[13px] text-body">
      {dif > 0 ? (
        <>
          El libro del día cuenta <Plata valor={dif} /> más de efectivo que este turno: es plata que no pasó por él (lo que quedó de
          otros días, de un turno anterior o lo cobrado sin turno abierto). Para contar el cajón vale la cifra del turno; si esa plata ya no está, cargala
          como retiro con «Cargar un gasto o retiro».
        </>
      ) : (
        <>
          Este turno cuenta <Plata valor={-dif} /> más de efectivo que el libro del día: hay movimientos del turno de otro día. Para
          contar el cajón vale la cifra del turno.
        </>
      )}
    </p>
  );
}

function TurnoDeCajero({ caja, libro, className = "mt-8" }: { caja: Turno; libro?: number; className?: string }) {
  const { open, recentClosed } = caja;
  let cuerpo: React.ReactNode;
  if (!open) {
    cuerpo = (
      <div className="pt-3">
        <p className="mb-3 text-sm text-muted">No hay un turno abierto. Abrilo con el efectivo con el que arranca el cajón.</p>
        <div className="max-w-sm">
          <OpenCajaForm />
        </div>
      </div>
    );
  } else {
    // El esperado en vivo cuenta SÓLO el efectivo del cajón (mismo cálculo que el arqueo).
    const movs: CashMovementLike[] = open.movements.map((m) => ({
      type: m.type as CashMovementType,
      amount: m.amount,
      // Un movimiento del demo no trae medio: es efectivo (el mismo relleno que la pantalla de siempre).
      method: ("method" in m && m.method ? m.method : "EFECTIVO") as CashMethod,
    }));
    const esperado = expectedCash(open.openingFloat, movs);
    const b = summarizeMovements(movs);
    cuerpo = (
      <div className="pt-1">
        <LineaDeCuenta
          concepto="Fondo inicial"
          detalle={`Abierto ${fmtShortDate(open.openedAt)} · ${fmtTime(open.openedAt)}`}
          importe={<Plata valor={open.openingFloat} />}
        />
        {b.sales > 0 && <LineaDeCuenta concepto="Ventas en efectivo" importe={<Plata valor={b.sales} />} />}
        {b.cashIn > 0 && <LineaDeCuenta concepto="Otros ingresos" importe={<Plata valor={b.cashIn} />} />}
        {b.cashOut > 0 && <LineaDeCuenta concepto="Gastos" importe={<Plata valor={-b.cashOut} />} />}
        {b.withdrawals > 0 && <LineaDeCuenta concepto="Retiros" importe={<Plata valor={-b.withdrawals} />} />}
        <LineaDeCuenta total concepto="Efectivo esperado en el cajón" importe={<Plata valor={esperado} />} />
        {libro !== undefined && <DiferenciaConElLibro libro={libro} turno={esperado} />}
        <div className="mt-3">
          <CerrarTurno esperado={esperado} />
        </div>
      </div>
    );
  }
  return (
    <section aria-labelledby="turno-cajero" className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
        <h2 id="turno-cajero" className="text-[15px] font-semibold text-strong">
          Turno de cajero
        </h2>
        <span className="text-[13px] text-muted">
          {open ? <Marca tipo="hecho">Abierto</Marca> : <Marca tipo="pendiente">Cerrado</Marca>}
        </span>
      </div>
      {cuerpo}
      {recentClosed.length > 0 && (
        <details className="group mt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-b border-line text-sm font-semibold text-strong">
            Últimos turnos cerrados
            <span aria-hidden className="text-muted group-open:rotate-90">
              ›
            </span>
          </summary>
          {recentClosed.map((s) => {
            const diff = s.closingDiff ?? 0;
            return (
              <Renglon
                key={s.id}
                folio={s.closedAt ? fmtShortDate(s.closedAt).slice(0, 5) : "—"}
                titulo={
                  <span className="font-normal">
                    Contó <Plata valor={s.closingCounted ?? 0} /> sobre <Plata valor={s.closingExpected ?? 0} />
                  </span>
                }
                plata={
                  diff === 0 ? (
                    <Marca tipo="hecho">Cuadró</Marca>
                  ) : (
                    <span className="text-sm">
                      <span className="mr-1 text-muted">{diff < 0 ? "faltó" : "sobró"}</span>
                      <Plata valor={Math.abs(diff)} tono={diff < 0 ? "peligro" : "cobrado"} />
                    </span>
                  )
                }
              />
            );
          })}
        </details>
      )}
    </section>
  );
}

export default function CajaRenglon({ dia, caja }: { dia: Dia; caja: Turno | null }) {
  const deHoy = dia.movements.filter((m) => m.day === dia.day).length;
  return (
    <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
      <header data-ui="page-header" className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-strong">Caja del día</h1>
          <LineaDeEstado
            datos={[
              <strong key="d">{diaLargo(dia.day)}</strong>,
              dia.yaCerrado ? "día cerrado" : "día abierto",
              caja ? (caja.open ? `turno abierto desde las ${fmtTime(caja.open.openedAt)}` : "sin turno de cajero abierto") : null,
              !dia.yaCerrado ? `${deHoy} ${deHoy === 1 ? "movimiento" : "movimientos"} hoy` : null,
            ]}
          />
        </div>
        {!dia.yaCerrado && (
          <div className="flex flex-wrap gap-2">
            <CargarMovimiento dia={dia.day} />
            <Link href="/admin/caja/cierre" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
              Cerrar el día
            </Link>
          </div>
        )}
      </header>

      {dia.yaCerrado ? (
        <div className="max-w-3xl">
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
              <h2 className="text-[15px] font-semibold text-strong">
                <Marca tipo="hecho">El {diaLargo(dia.day).toLowerCase()} ya está cerrado</Marca>
              </h2>
              {dia.registro && (
                <span className="text-[13px] text-muted">
                  lo cerró {dia.registro.quien} · {fmtShortDate(dia.registro.cerradoEl)}
                </span>
              )}
            </div>
            <p className="py-3 text-sm text-body">{dia.lastClosedDay ? frozenDayMessage(dia.day, dia.lastClosedDay) : null}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/caja/cierre" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
                Ver el cierre
              </Link>
              <Link href="/admin/caja/libro" className={buttonClasses("ghost", "md")} {...atributosBoton("ghost", "md")}>
                Ver el mes en el libro
              </Link>
            </div>
          </section>
          {caja && <TurnoDeCajero caja={caja} />}
        </div>
      ) : (
        <div className="grid gap-x-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="min-w-0">
            <PorMedio dia={dia} />
            <MovimientosDeHoy dia={dia} />
          </div>
          <div className="min-w-0">
            {caja && <TurnoDeCajero caja={caja} libro={dia.preview.porMedio.EFECTIVO.expected} className="mt-8 lg:mt-0" />}
          </div>
        </div>
      )}
    </main>
  );
}
