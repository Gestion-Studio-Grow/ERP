// ============================================================================
// CIERRE DEL DÍA — la pantalla del diseño nuevo («Renglón»). Servidor.
// ============================================================================
//
// Los MISMOS datos que la pantalla de siempre (`getCierreDiarioData`, una lectura) en otro orden:
//
//   · abierto: primero CONTAR (ContarYCerrar, a la izquierda) y, al lado, «Cómo se llega a este
//     número», medio por medio y SIN los renglones en cero; los movimientos del período, plegados;
//   · cerrado: el COMPROBANTE (quién, cuándo, cuánto contó por medio) y los dos archivos del día;
//   · un día absorbido por un cierre posterior o que todavía no pasó lo dice en una franja.
//
// El arqueo a ciegas del CIERRE (no ver «Debería haber» hasta cargar lo contado) NO está: el
// interruptor «arqueo-ciego» (N2 · M1-C3) es de la APERTURA de la caja. Esta pantalla no finge tenerlo.
//
// N2 · M1: columnas EFECTIVO · MP · TRANSFERENCIA (· TARJETA si se puede cobrar con tarjeta); el
// efectivo reusa lo contado al cerrar el turno; con un turno abierto, o para recepción, no se
// ofrece cerrar (lo dice y por qué); en un día cerrado, la dueña puede reabrirlo.

import Link from "next/link";
import type { getCierreDiarioData } from "@/lib/cierre-diario-actions";
import { CASH_METHOD_LABEL } from "@/lib/caja/libro-caja";
import { EFECTIVO_SE_VE_AL_ABRIR } from "@/lib/caja/arqueo-ciego-core";
import { formatDayLabel, nextDayKey, CERRAR_DIA_SIN_PERMISO, ETIQUETA_DE_COLUMNA, type ColumnaDelCierre } from "@/lib/caja/cierre-diario";
import { movementSign } from "@/lib/caja/cash-register";
import { causasProbables, textoDeAperturaQueNoSuma } from "./revisar-cierre";
import { fmtDateTime, fmtTime } from "@/lib/datetime";
import { DosColumnas, Franja, LineaDeEstado, Marca, Plata, Renglon, Rotulo, atributosBoton, fmtMoneyARS } from "@/components/ui";
import { LineaDeCuenta } from "@/components/ui/LineaDeCuenta";
import { PasoDePeriodo } from "@/components/ui/PasoDePeriodo";
import { diaAnterior, diaLargo, diaMes, diasEntre, nombreMes } from "../_renglon/fechas";
import ContarYCerrar, { ReabrirElDia, type MedioAContar } from "./ContarYCerrar";
import { diferenciaDelComprobante, type MedioDelComprobante } from "./comprobante";
import { leerMediosDelComprobante } from "./comprobante.server";

type Datos = Awaited<ReturnType<typeof getCierreDiarioData>>;

const RUTA = "/admin/caja/cierre";

const AYUDA: Record<ColumnaDelCierre, string> = {
  EFECTIVO: "El cajón. Obligatorio, aunque sea 0.",
  MP: "El saldo de la app de Mercado Pago.",
  TRANSFERENCIA: "Lo que entró por transferencia al banco desde el último cierre (no el saldo).",
  TARJETA: "Opcional: el cierre del posnet; se liquida a los días.",
};

const ORIGEN: Record<string, string> = { pos: "venta del mostrador", turno: "turno cobrado", manual: "cargado a mano" };

function Encabezado({ d, regla }: { d: Datos; regla: string | null }) {
  const { day, today, since, preview, yaCerrado } = d;
  const sinCerrar = !yaCerrado && since && since < day ? diasEntre(since, day) : 0;
  return (
    <header data-ui="page-header" className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-strong">Cierre del día</h1>
        <LineaDeEstado
          datos={[
            <strong key="d">{diaLargo(day)}</strong>,
            yaCerrado ? "cerrado" : since ? (sinCerrar > 0 ? `abarca desde el ${diaMes(since)}: ${sinCerrar === 1 ? "1 día" : `${sinCerrar} días`} sin cerrar` : null) : "todavía no hubo ningún cierre",
            yaCerrado ? null : `${preview.movementCount} ${preview.movementCount === 1 ? "movimiento" : "movimientos"}`,
            regla,
          ]}
        />
      </div>
      <PasoDePeriodo
        etiqueta="Día"
        actual={day === today ? "Hoy" : diaMes(day)}
        anterior={{ href: `${RUTA}?dia=${diaAnterior(day)}`, texto: diaMes(diaAnterior(day)) }}
        siguiente={day < today ? { href: `${RUTA}?dia=${nextDayKey(day)}`, texto: diaMes(nextDayKey(day)) } : null}
        volver={day !== today ? { href: RUTA, texto: "Hoy" } : null}
      />
    </header>
  );
}

/** El comprobante de un día cerrado: la misma hoja con la que se contó, ahora en tinta. */
function Comprobante({ d, medios }: { d: Datos; medios: MedioDelComprobante[] | null }) {
  const r = d.registro!;
  const resumen = r.resumen!;
  const diferencia = medios ? diferenciaDelComprobante(medios) : null;
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-2">
        <h2 className="text-[15px] font-semibold text-strong">
          <Marca tipo="hecho">Cerrado</Marca>
        </h2>
        <span className="text-[13px] text-muted">
          el {fmtDateTime(r.cerradoEl)} por {r.quien} · {resumen.titulo}
        </span>
      </div>
      {medios ? (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_8rem_8rem_8rem] gap-x-4 border-b border-line py-1.5 sm:grid" aria-hidden>
            <Rotulo as="span">Medio</Rotulo>
            <Rotulo as="span" className="text-right">
              Contó
            </Rotulo>
            <Rotulo as="span" className="text-right">
              Debería haber
            </Rotulo>
            <Rotulo as="span" className="text-right">
              Diferencia
            </Rotulo>
          </div>
          <dl>
            {medios.map((m) => (
              <div
                key={m.medio}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-line py-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem]"
              >
                <dt className="font-medium text-strong">{CASH_METHOD_LABEL[m.medio]}</dt>
                <dd className="text-right">
                  <span className="mr-1 text-[13px] text-muted sm:hidden">contó</span>
                  {m.declarado === null ? <span className="text-sm text-muted">sin conciliar</span> : <Plata valor={m.declarado} />}
                </dd>
                <dd className="col-span-2 text-right text-[13px] text-muted sm:col-span-1 sm:text-sm sm:text-body">
                  <span className="mr-1 sm:hidden">debería haber</span>
                  <Plata valor={m.esperado} />
                </dd>
                <dd className="col-span-2 text-right text-sm sm:col-span-1">
                  {m.diferencia === null ? (
                    <span className="text-muted">—</span>
                  ) : m.diferencia === 0 ? (
                    <span className="font-semibold text-success">Cuadra</span>
                  ) : (
                    <>
                      <span className="mr-1 text-muted">{m.diferencia < 0 ? "faltan" : "sobran"}</span>
                      <Plata valor={Math.abs(m.diferencia)} tono={m.diferencia < 0 ? "peligro" : "cobrado"} />
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line-strong py-4 [container-type:inline-size]">
            <div>
              <Rotulo>Diferencia del día</Rotulo>
              <p className="mt-1 text-sm text-body">
                {diferencia === 0
                  ? "Cuadró."
                  : `${diferencia! < 0 ? "Faltaron" : "Sobraron"} ${fmtMoneyARS(Math.abs(diferencia!))}: quedó asentado en el libro como ajuste.`}
              </p>
            </div>
            <Plata valor={diferencia!} tamano="grande" tono={diferencia! < 0 ? "peligro" : diferencia! > 0 ? "cobrado" : undefined} />
          </div>
        </>
      ) : (
        resumen.medios.map((m) => {
          const [medio, ...resto] = m.split(": ");
          return <Renglon key={m} folio={medio} titulo={resto.join(": ")} />;
        })
      )}
      {resumen.nota && <Renglon folio="Nota" titulo={<span className="font-normal">“{resumen.nota}”</span>} />}
      <p className="mt-3 text-sm text-muted">
        {d.reabrir?.puede
          ? "Si apareció algo de este día (una venta del cuaderno, una rendición), podés reabrirlo, cargarlo y cerrarlo de nuevo."
          : `Un cierre no se rehace: si apareció algo, cargalo con fecha ${formatDayLabel(nextDayKey(d.lastClosedDay!))} y aclaralo en el detalle.`}
      </p>
      {d.reabrir?.puede && (
        <div className="mt-3">
          <ReabrirElDia day={d.day} diaNombre={diaLargo(d.day).toLowerCase().split(" de ")[0]} />
        </div>
      )}
      {d.reabrir && !d.reabrir.puede && <p className="mt-2 text-sm text-muted">{d.reabrir.porque}</p>}
      {/* Celular: las tres teclas a lo ancho, una debajo de la otra. PC: en una línea. */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {/* <a> y no <Link>: son archivos, no pantallas (Link los precargaría). */}
        <a href={`/admin/caja/libro/export?dia=${d.day}`} {...atributosBoton("solid", "md")} className="inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium">
          Bajar el libro de este día
        </a>
        <a href={`/admin/caja/libro/export?mes=${d.day.slice(0, 7)}`} {...atributosBoton("outline", "md")} className="inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm font-medium">
          Bajar {nombreMes(d.day.slice(0, 7))} completo
        </a>
        <Link href={`/admin/caja/libro?mes=${d.day.slice(0, 7)}`} {...atributosBoton("ghost", "md")} className="inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium">
          Ver el libro de {nombreMes(d.day.slice(0, 7))}
        </Link>
      </div>
    </div>
  );
}

/** «Cómo se llega a este número»: medio por medio, sin los renglones en cero. */
function ComoSeLlega({ d }: { d: Datos }) {
  const { preview } = d;
  const medios = d.columnas.filter((m) => {
    const x = preview.porColumna[m];
    return x.opening !== 0 || x.ingresos !== 0 || x.egresos !== 0;
  });
  return (
    <section aria-labelledby="como-se-llega">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-2">
        <h2 id="como-se-llega" className="text-[15px] font-semibold text-strong">
          Cómo se llega a este número
        </h2>
        <span className="text-[13px] text-muted">Sólo lo que se movió</span>
      </div>
      {medios.length === 0 && <p className="py-3 text-sm text-muted">No se movió plata en el período: el cierre confirma que no hay nada.</p>}
      {medios.map((m) => {
        const x = preview.porColumna[m];
        return (
          <div key={m} className="mt-3">
            <Rotulo className="pb-1">{ETIQUETA_DE_COLUMNA[m]}</Rotulo>
            {x.opening !== 0 && <LineaDeCuenta concepto="Saldo al abrir" importe={<Plata valor={x.opening} />} />}
            {x.ingresos !== 0 && (
              <LineaDeCuenta
                concepto="Entró"
                detalle={x.cobrosCartera > 0 ? `incluye cobros de cuentas por ${fmtMoneyARS(x.cobrosCartera)}` : undefined}
                importe={<Plata valor={x.ingresos} />}
              />
            )}
            {x.egresos !== 0 && <LineaDeCuenta concepto="Salió" importe={<Plata valor={-x.egresos} />} />}
            <LineaDeCuenta total concepto="Debería haber" importe={<Plata valor={x.expected} />} />
          </div>
        );
      })}
      {d.movements.length > 0 && (
        <details className="group mt-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-b border-line text-sm font-semibold text-strong">
            Los {d.movements.length} movimientos del período
            <span aria-hidden className="text-muted transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div>
            {d.movements.map((m) => {
              // Misma tabla de signos que el libro: la apertura es el conteo del cajón y no suma.
              const signo = movementSign(m.type);
              return (
                <Renglon
                  key={m.id}
                  folio={diaMes(m.day)}
                  titulo={<span className="font-normal">{m.detail || "(sin detalle)"}</span>}
                  detalle={`${CASH_METHOD_LABEL[m.method]} · ${ORIGEN[m.origin] ?? m.origin}${signo === 0 && m.amount !== null ? ` · ${textoDeAperturaQueNoSuma(m.amount)}` : ""}`}
                  plata={
                    // null sólo llega a ciegas (`diaALaVista`); esta pantalla pide el esperado a la vista.
                    m.amount === null ? <span className="text-sm text-muted">{EFECTIVO_SE_VE_AL_ABRIR.toLowerCase()}</span> : signo === 0 ? null : <Plata valor={signo * m.amount} />
                  }
                />
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}

function TurnosSinCerrar({ d }: { d: Datos }) {
  const turnos = d.turnosSinCerrar ?? [];
  if (turnos.length === 0) return null;
  return (
    <section aria-labelledby="turnos-sin-cerrar" className="mb-6">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-2">
        <h2 id="turnos-sin-cerrar" className="text-[15px] font-semibold text-strong">
          <Marca tipo="atencion">
            {turnos.length === 1 ? "1 turno sin cerrar" : `${turnos.length} turnos sin cerrar`}
          </Marca>
        </h2>
        <span className="text-[13px] text-muted">Se puede cerrar igual</span>
      </div>
      <p className="py-2 text-sm text-muted">Pasó la hora y siguen reservados o confirmados: un cobro que no se registró o una ausencia sin marcar.</p>
      {turnos.map((t) => (
        <Renglon
          key={t.id}
          folio={fmtTime(t.startsAt)}
          titulo={t.clienta}
          detalle={`${t.servicio} · ${t.profesional} · ${t.status === "PENDING" ? "reservado" : "confirmado"}`}
          plata={t.saldo === null ? <span className="text-muted">—</span> : t.saldo > 0 ? <Plata valor={t.saldo} /> : <span className="text-sm text-muted">saldado</span>}
          tecla={
            <Link href={`/admin/turnos/lista#turno-${t.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline underline-offset-4">
              Ir al turno
            </Link>
          }
        />
      ))}
    </section>
  );
}

export default async function CierreRenglon({ d, regla = null }: { d: Datos; regla?: string | null }) {
  const { day, yaCerrado, enElFuturo, registro, lastClosedDay, preview } = d;
  const medios: MedioAContar[] = d.columnas.map((m) => {
    const x = preview.porColumna[m];
    return {
      medio: m,
      etiqueta: ETIQUETA_DE_COLUMNA[m],
      ayuda: AYUDA[m],
      esperado: x.expected,
      seMovio: x.opening !== 0 || x.ingresos !== 0 || x.egresos !== 0,
    };
  });
  const nombre = diaLargo(day).toLowerCase().split(" de ")[0]; // «jueves 24»
  const mediosCerrados = yaCerrado && registro ? await leerMediosDelComprobante(day) : null;
  return (
    <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
      <Encabezado d={d} regla={regla} />
      {yaCerrado && registro && <Comprobante d={d} medios={mediosCerrados} />}
      {yaCerrado && !registro && (
        <Franja tono="info">
          El {diaLargo(day).toLowerCase()} quedó adentro del cierre del {diaMes(lastClosedDay!)}: cerrar un día arquea todo lo que quedó
          desde el cierre anterior.{" "}
          <Link href={`${RUTA}?dia=${lastClosedDay}`} className="font-semibold underline">
            Ver ese cierre
          </Link>
        </Franja>
      )}
      {enElFuturo && <Franja tono="atencion">El {diaLargo(day).toLowerCase()} todavía no pasó: el día se cierra cuando terminó.</Franja>}
      {!yaCerrado && !enElFuturo && (
        <DosColumnas>
          <div className="min-w-0">
            <TurnosSinCerrar d={d} />
            {!d.puedeCerrar ? (
              <Franja tono="info">{CERRAR_DIA_SIN_PERMISO}</Franja>
            ) : d.turnoAbierto ? (
              <Franja tono="atencion">
                Hay un turno de caja abierto: lo abrió {d.turnoAbierto.quien} a las {d.turnoAbierto.hora}. El día se cierra después de
                cerrar ese turno, con su conteo.{" "}
                <Link href="/admin/caja" className="font-semibold underline">
                  Ir a Caja
                </Link>
              </Franja>
            ) : (
              <ContarYCerrar
                key={day}
                day={day}
                diaLabel={formatDayLabel(day)}
                diaNombre={nombre}
                medios={medios}
                conteoDelTurno={d.conteoDelTurno}
                causas={causasProbables(d.hechos)}
              />
            )}
          </div>
          <aside className="min-w-0" aria-label="De dónde sale lo que debería haber">
            <ComoSeLlega d={d} />
          </aside>
        </DosColumnas>
      )}
    </main>
  );
}
