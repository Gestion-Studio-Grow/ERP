"use client";

// ============================================================================
// «CERRAR EL DÍA» EN TRES PASOS — la pantalla (reingeniería CH, Tanda 3 · §2.7, CH-038).
// ============================================================================
//
//   1 · Antes de contar → los turnos de ESE día que quedaron sin cerrar, en la MISMA bandeja de
//       «Cerrar lo pendiente» (CerrarPendientes + `cerrarTurnosEnLote`): se resuelven ahí mismo.
//       Se puede seguir a contar igual: la caja cuenta plata, no turnos.
//   2 · Contá la plata  → el arqueo de siempre (ContarYCerrar + `cerrarDia`): el efectivo es
//       obligatorio, con diferencia pide «Qué pasó» y la diferencia queda asentada en el libro; se
//       cierra DESLIZANDO (irreversible). Sin la migración M1 dice «hoy la tarjeta se registra como
//       Mercado Pago».
//   3 · Listo           → lo que se contó, medio por medio, y «Mandar el cierre por WhatsApp».
//
// Nada de plata nueva acá: todo lo que escribe lo escriben las acciones de siempre. El servidor decide
// el paso con que abre (`pasoDelCierre`) y, cuando el día se cierra, la pantalla vuelve a montarse en
// el 3 (la página le cambia la `key`). Los pasos 1 y 2 se cambian sin ir al servidor; la URL se
// actualiza (`?paso=`) para que «Atrás» y un enlace compartido abran el mismo paso.
//
// La piel «Renglón» la pone la página (PielPropia + ConDiseno, §0.2): así el encabezado y los pasos
// se visten igual aunque «Diseño nuevo» esté apagado.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Franja, Marca, Plata, Rotulo, atributosBoton } from "@/components/ui";
import { CASH_METHOD_LABEL } from "@/lib/caja/libro-caja";
import { fmtMoneyARS } from "@/components/ui/format";
import CerrarPendientes from "../../turnos/cerrar/CerrarPendientes";
import type { PermisosDeLaBandeja, TurnoPendiente } from "../../turnos/cerrar/cerrar-core";
import ContarYCerrar, { type MedioAContar } from "./ContarYCerrar";
import type { MedioDelComprobante } from "./comprobante";
import { PASOS, hrefDelPaso, type EstadoDelDia, type Paso } from "./cerrar-el-dia-core";

export type ComprobanteDelDia = {
  medios: MedioDelComprobante[] | null;
  /** Las frases del cierre (cuando no hay números por medio). */
  frases: string[];
  nota: string | null;
  quien: string;
  /** «22/10/2026 20:14». */
  cerradoEl: string;
  turnos: number | null;
  /** El texto del WhatsApp y su enlace (vacío / null si no se pudo armar). */
  mensaje: string;
  whatsapp: string | null;
};

export type PropsCerrarElDia = {
  day: string;
  hoy: string;
  /** «22/10/2026». */
  diaLabel: string;
  /** «jueves 22». */
  diaNombre: string;
  /** «Jueves 22 de octubre». */
  diaLargo: string;
  estado: EstadoDelDia;
  /** El paso con que abre (null = el día no tiene pasos: futuro o absorbido). */
  paso: Paso | null;
  /** Absorbido: el día cuyo cierre lo abarcó. */
  cerradoCon: string | null;
  /** Los turnos de ese día sin cerrar (null = quien mira no ve la agenda). */
  pendientes: TurnoPendiente[] | null;
  permisosBandeja: PermisosDeLaBandeja;
  medios: MedioAContar[];
  /** D6: «hoy la tarjeta se registra como Mercado Pago» (null con la tarjeta separada). */
  notaTarjeta: string | null;
  comprobante: ComprobanteDelDia | null;
  letraDelNegocio: boolean;
};

const TECLA = "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium";

function Pasos({ actual, cerrado, pendientes, ir }: { actual: Paso; cerrado: boolean; pendientes: number; ir: (p: Paso) => void }) {
  return (
    <nav aria-label="Pasos del cierre" className="mb-6">
      <ol className="grid grid-cols-3 gap-1.5">
        {PASOS.map(({ paso, titulo }) => {
          const esActual = paso === actual;
          // Con el día cerrado no se vuelve a contar; abierto, a «Listo» no se llega sin cerrar.
          const habilitado = !esActual && (cerrado ? false : paso !== 3);
          const contenido = (
            <>
              <span className="text-xs text-muted">Paso {paso}</span>
              <span className="font-semibold text-strong">
                {titulo}
                {paso === 1 && pendientes > 0 && !cerrado && <span className="ml-1 font-normal text-muted">({pendientes})</span>}
              </span>
            </>
          );
          const clase = `flex min-h-11 w-full flex-col items-start rounded border-b-2 px-2 py-1.5 text-left text-sm ${esActual ? "border-accent bg-surface-raised" : "border-line"}`;
          return (
            <li key={paso}>
              {habilitado ? (
                <button type="button" onClick={() => ir(paso)} className={`${clase} hover:bg-surface-raised`}>
                  {contenido}
                </button>
              ) : (
                <span className={clase} aria-current={esActual ? "step" : undefined} aria-disabled={esActual ? undefined : true}>
                  {contenido}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function PasoUno({ p, seguir }: { p: PropsCerrarElDia; seguir: () => void }) {
  const delDia = p.pendientes ?? [];
  return (
    <section aria-labelledby="paso-1" className="flex flex-col gap-4">
      <h2 id="paso-1" className="text-lg font-semibold text-strong">
        Antes de contar: los turnos del {p.diaNombre} sin cerrar
      </h2>
      {p.pendientes === null ? (
        <p className="text-sm text-muted">Los turnos los cierra la recepción desde la agenda. Podés seguir a contar la plata.</p>
      ) : delDia.length === 0 ? (
        <p className="text-sm text-body">
          <Marca tipo="hecho">Listo, no quedó ningún turno sin cerrar del {p.diaNombre}.</Marca>
        </p>
      ) : (
        <>
          <p className="text-sm text-body">
            Pasó la hora y siguen reservados o confirmados: cobralos o marcá que no vinieron, así lo que contás coincide con lo que dice el libro.
          </p>
          <div data-cierre="pendientes" className="-mx-4 sm:mx-0">
            <CerrarPendientes turnos={delDia} permisos={p.permisosBandeja} hoy={p.hoy} letraDelNegocio={p.letraDelNegocio} />
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button type="button" variant="solid" onClick={seguir}>
          Seguir: contar la plata →
        </Button>
        {delDia.length > 0 && <span className="text-sm text-muted">Se puede cerrar la caja igual: los turnos se cierran después.</span>}
      </div>
    </section>
  );
}

function PasoDos({ p, volver }: { p: PropsCerrarElDia; volver: () => void }) {
  return (
    <section aria-labelledby="paso-2" className="flex max-w-3xl flex-col gap-4">
      <h2 id="paso-2" className="sr-only">
        Contá la plata
      </h2>
      {p.notaTarjeta && (
        <p role="note" data-cierre="tarjeta-como-mp" className="border-l-2 border-warning pl-3 text-sm text-body">
          {p.notaTarjeta}
        </p>
      )}
      <ContarYCerrar key={p.day} day={p.day} diaLabel={p.diaLabel} diaNombre={p.diaNombre} medios={p.medios} />
      <div>
        <Button type="button" variant="ghost" onClick={volver}>
          ← Volver a los turnos sin cerrar
        </Button>
      </div>
    </section>
  );
}

function PasoTres({ p }: { p: PropsCerrarElDia }) {
  const c = p.comprobante;
  if (!c) return null;
  const diferencia = c.medios ? Math.round(c.medios.reduce((s, m) => s + (m.diferencia ?? 0), 0) * 100) / 100 : null;
  return (
    <section aria-labelledby="paso-3" className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-2">
        <h2 id="paso-3" className="text-[15px] font-semibold text-strong">
          <Marca tipo="hecho">Cerrado</Marca>
        </h2>
        <span className="text-[13px] text-muted">
          el {c.cerradoEl} por {c.quien}
        </span>
      </div>
      {c.medios ? (
        <dl>
          {c.medios.map((m) => (
            <div key={m.medio} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-line py-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem]">
              <dt className="font-medium text-strong">{CASH_METHOD_LABEL[m.medio]}</dt>
              <dd className="text-right">
                {m.declarado === null ? (
                  <span className="text-sm text-muted">sin contar</span>
                ) : (
                  <>
                    <span className="mr-1 text-[13px] text-muted">contó</span>
                    <Plata valor={m.declarado} />
                  </>
                )}
              </dd>
              <dd className="col-span-2 text-right text-[13px] text-muted sm:col-span-1">
                <span className="mr-1">debía</span>
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
      ) : (
        <ul className="text-sm text-body">
          {c.frases.map((f) => (
            <li key={f} className="border-b border-line py-2">
              {f}
            </li>
          ))}
        </ul>
      )}
      {diferencia !== null && (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line-strong pb-4 [container-type:inline-size]">
          <div>
            <Rotulo>Diferencia del día</Rotulo>
            <p className="mt-1 text-sm text-body">
              {diferencia === 0 ? "Cuadró." : `${diferencia < 0 ? "Faltaron" : "Sobraron"} ${fmtMoneyARS(Math.abs(diferencia))}: quedó asentado en el libro como ajuste.`}
            </p>
          </div>
          <Plata valor={diferencia} tamano="grande" tono={diferencia < 0 ? "peligro" : diferencia > 0 ? "cobrado" : undefined} />
        </div>
      )}
      {c.nota && <p className="text-sm text-body">Qué pasó: «{c.nota}»</p>}
      {c.turnos !== null && <p className="text-sm text-muted">{c.turnos === 1 ? "1 turno atendido" : `${c.turnos} turnos atendidos`} ese día.</p>}

      {c.whatsapp ? (
        <div className="flex flex-col gap-2 rounded border border-line bg-surface-raised p-3">
          <Rotulo>El mensaje</Rotulo>
          <p data-cierre="mensaje" className="text-sm text-body">
            {c.mensaje}
          </p>
          <a href={c.whatsapp} target="_blank" rel="noopener noreferrer" {...atributosBoton("solid", "md")} className={`${TECLA} self-start`}>
            Mandar el cierre por WhatsApp
          </a>
        </div>
      ) : (
        <p className="text-sm text-muted">No se pudo armar el mensaje del cierre: mirá el detalle en el libro.</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link href={`/admin/caja/libro?mes=${p.day.slice(0, 7)}`} {...atributosBoton("outline", "md")} className={`${TECLA} border`}>
          Ver el libro
        </Link>
        {/* <a> y no <Link>: es un archivo, no una pantalla. */}
        <a href={`/admin/caja/libro/export?dia=${p.day}`} {...atributosBoton("ghost", "md")} className={TECLA}>
          Bajar el libro de este día
        </a>
      </div>
      <p className="text-sm text-muted">Un cierre no se rehace: si aparece algo, se carga con la fecha del día siguiente y se aclara en el detalle.</p>
    </section>
  );
}

export default function CerrarElDia(p: PropsCerrarElDia) {
  const [paso, setPaso] = useState<Paso | null>(p.paso);
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeraVez = useRef(true);

  // La URL sigue al paso (Atrás y un enlace compartido abren el mismo); el foco va al título del paso.
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    if (paso === null) return;
    try {
      window.history.replaceState(window.history.state, "", hrefDelPaso(p.day, p.hoy, paso));
    } catch {
      // sin historial (vista previa): el paso igual cambia
    }
    titulo.current?.focus();
  }, [paso, p.day, p.hoy]);

  const pendientes = p.pendientes?.length ?? 0;
  return (
    <div data-pantalla="cerrar-el-dia">
      <h2 ref={titulo} tabIndex={-1} className="sr-only">
        {paso ? `Paso ${paso} de 3: ${PASOS[paso - 1].titulo}` : `Cierre del ${p.diaLargo}`}
      </h2>
      {p.estado === "futuro" && <Franja tono="atencion">El {p.diaLargo.toLowerCase()} todavía no pasó: el día se cierra cuando terminó.</Franja>}
      {p.estado === "absorbido" && (
        <Franja tono="info">
          El {p.diaLargo.toLowerCase()} quedó adentro del cierre del {p.cerradoCon ?? "día siguiente"}: cerrar un día arquea todo lo que quedó desde
          el cierre anterior.
        </Franja>
      )}
      {paso !== null && (
        <>
          <Pasos actual={paso} cerrado={p.estado === "cerrado"} pendientes={pendientes} ir={setPaso} />
          {paso === 1 && <PasoUno p={p} seguir={() => setPaso(2)} />}
          {paso === 2 && <PasoDos p={p} volver={() => setPaso(1)} />}
          {paso === 3 && <PasoTres p={p} />}
        </>
      )}
    </div>
  );
}
