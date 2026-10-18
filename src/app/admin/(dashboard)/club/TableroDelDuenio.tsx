"use client";

// ============================================================================
// EL TABLERO DEL DUEÑO — lo que espera su OK y cómo viene el club hoy.
// ============================================================================
//
// Arriba, lo que pide una decisión: «Novedades para autorizar» (crédito con su monto, que el dueño puede cambiar;
// pedidos de acceso, con el rol, y el PIN que genera el motor a la vista UNA sola vez, con «Listo, ya se lo di»).
// Después, para mirar: los indicadores del día, las canchas ahora, la caja por medio, la ocupación de la semana
// (mapa de calor, con su tabla), los platos más vendidos y «qué pasó hoy». En la DEMO, además, las cámaras simuladas
// (camaras-de-la-demo.tsx, en su propio chunk), como el vanilla: en la jornada real no se ven.
//
// Es solapa `soloDuenos` (solapas-club.ts): esconderla no es seguridad; autorizar y dar accesos los vuelve a
// controlar el motor con el usuario del club (operador-del-club.ts). Nada se anima: se mira muchas veces por día.

import { Suspense, lazy, useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { KpiTile } from "@/components/ui/KpiTile";
import { cn } from "@/components/ui/cn";
import { ROLES, pesos } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Rol } from "@/lib/club/motor.mjs";
import { operadorActual } from "./operador-del-club";
import type { PropsDeSolapa } from "./solapas-club";
import { armarTablero, ejecutarTablero, type AccesoPedido, type AccionTablero, type DesenlaceTablero, type PedidoParaAutorizar, type VistaTablero } from "./tablero-core";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";

// Sólo en la demo: baja en su propio chunk (la jornada real ni lo pide).
const CamarasDeLaDemo = lazy(() => import("./camaras-de-la-demo"));

const seleccionarTablero = (e: EstadoClub, a: Ahora) => armarTablero(e, a);
const tarjeta = "flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4";
const etiqueta = "text-sm font-medium text-strong";
const ROL_DETALLE: Record<Rol, string> = {
  recepcion: `${ROLES.recepcion} (agenda, cobros, buffet, remitos y egresos en efectivo)`,
  duenio: `${ROLES.duenio} (todo)`,
};

function PedidoDeCredito({ p, hacer }: { p: PedidoParaAutorizar; hacer: (a: AccionTablero) => DesenlaceTablero }) {
  const [monto, setMonto] = useState(String(p.monto));
  const id = useId();
  return (
    <li>
      <article aria-labelledby={`${id}-t`} className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-soft p-3">
        <h3 id={`${id}-t`} className="text-xs font-semibold tracking-wide text-strong uppercase">
          {p.rotulo} · {p.cliente}
        </h3>
        <p className="text-sm text-strong">
          <strong>{p.pidio}</strong> pide {p.que} para <strong>{p.cliente}</strong>.{p.nota ? ` «${p.nota}»` : ""}
        </p>
        {p.debe > 0 && <p className="text-sm font-semibold text-danger">⚠ Ya debe {pesos(p.debe)}</p>}
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            hacer({ tipo: "autorizar", novedadId: p.id, monto });
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={id} className={etiqueta}>
              {p.tipo === "fiado" ? "Monto que se fía" : "Límite de la cuenta"}
            </label>
            <Input id={id} inputMode="numeric" importe autoComplete="off" className="sm:w-40" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
          <Button type="submit" variant="solid" size="md">
            Autorizar
          </Button>
          <Button variant="outline" size="md" onClick={() => hacer({ tipo: "rechazar", novedadId: p.id })}>
            Rechazar
          </Button>
        </form>
      </article>
    </li>
  );
}

function PedidoDeAcceso({ s, hacer }: { s: AccesoPedido; hacer: (a: AccionTablero) => DesenlaceTablero }) {
  const [rol, setRol] = useState<Rol>("recepcion");
  const id = useId();
  return (
    <li>
      <article aria-labelledby={`${id}-t`} className="flex flex-col gap-2 rounded-md border border-line-strong bg-surface p-3">
        <h3 id={`${id}-t`} className="text-xs font-semibold tracking-wide text-strong uppercase">
          Acceso al sistema · {s.nombre}
        </h3>
        <p className="text-sm text-strong">
          <strong>{s.nombre}</strong> pidió entrar al sistema{s.cuando ? ` (${s.cuando})` : ""}. Si le das acceso, el sistema le arma un PIN que se muestra
          una sola vez.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            hacer({ tipo: "otorgar", solicitudId: s.id, rol });
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor={id} className={etiqueta}>
              Qué puede hacer
            </label>
            <Select id={id} value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {(Object.keys(ROL_DETALLE) as Rol[]).map((r) => (
                <option key={r} value={r}>
                  {ROL_DETALLE[r]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="solid" size="md">
            Dar acceso
          </Button>
          <Button variant="outline" size="md" onClick={() => hacer({ tipo: "rechazarAcceso", solicitudId: s.id })}>
            Rechazar
          </Button>
        </form>
      </article>
    </li>
  );
}

/** El PIN recién generado: a la vista hasta «Listo». No queda en el aviso ni en «qué pasó hoy». */
function PinDeUnaVez({ acceso, onListo }: { acceso: NonNullable<DesenlaceTablero["acceso"]>; onListo: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  return (
    <section aria-labelledby="club-pin-nuevo" className="flex flex-col items-start gap-2 rounded-lg border border-success/40 bg-success-soft p-4">
      <h2 id="club-pin-nuevo" ref={titulo} tabIndex={-1} className="font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
        ✔ Acceso otorgado a {acceso.nombre} · {acceso.rol}
      </h2>
      <p className="text-sm text-strong">Su PIN es</p>
      <p className="text-4xl font-bold tracking-widest tabular-nums text-strong">{acceso.pin}</p>
      <p className="text-sm text-strong">Dáselo en persona. No se vuelve a mostrar: si lo pierde, se le arma uno nuevo desde Configuración.</p>
      <Button variant="solid" size="md" onClick={onListo}>
        Listo, ya se lo di
      </Button>
    </section>
  );
}

function MapaDeCalor({ calor }: { calor: VistaTablero["calor"] }) {
  const columnas = { gridTemplateColumns: `4.5rem repeat(${calor.horas.length}, minmax(1.25rem, 1fr))` };
  const tono = (v: number) => ({ background: `color-mix(in oklab, var(--accent) ${Math.round(8 + v * 92)}%, var(--surface-raised))` });
  return (
    <>
      <div role="region" aria-label="Mapa de ocupación (se desliza de costado)" tabIndex={0} className="overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-focus">
        <div role="img" aria-label="Ocupación de los últimos 7 días por hora. El detalle está en la tabla de abajo." className="grid min-w-[36rem] gap-0.5" style={columnas}>
          <span />
          {calor.horas.map((h, i) => (
            <span key={i} className="text-center text-xs tabular-nums text-body">
              {h}
            </span>
          ))}
          {calor.filas.map((f) => (
            <div key={f.fecha} className="contents">
              <span className="pr-2 text-xs whitespace-nowrap text-body">{f.dia}</span>
              {f.valores.map((v, i) => (
                <span key={i} className="h-6 rounded-sm" style={tono(v)} title={`${f.dia} ${calor.horas[i]} h: ${Math.round(v * 100)} % ocupado`} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p aria-hidden className="flex items-center gap-1 text-xs text-body">
        Vacío
        {[0, 0.33, 0.66, 1].map((v) => (
          <i key={v} className="inline-block size-4 rounded-sm" style={tono(v)} />
        ))}
        Lleno
      </p>
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center text-body focus-visible:outline-2 focus-visible:outline-focus">Ver como tabla</summary>
        <div role="region" aria-label="Tabla de ocupación (se desliza de costado)" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-focus">
          <table className="text-xs tabular-nums">
            <caption className="sr-only">Ocupación por día y hora, en porcentaje</caption>
            <thead>
              <tr>
                <th scope="col" className="pr-2 text-left font-medium">
                  Día
                </th>
                {calor.horas.map((h, i) => (
                  <th key={i} scope="col" className="px-1 text-right font-medium">
                    {h} h
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calor.filas.map((f) => (
                <tr key={f.fecha} className="border-t border-line">
                  <th scope="row" className="pr-2 text-left font-medium whitespace-nowrap">
                    {f.dia}
                  </th>
                  {f.valores.map((v, i) => (
                    <td key={i} className="px-1 text-right">
                      {Math.round(v * 100)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

/** Una barra fina de proporción (el número va al lado, en texto: la barra es sólo de apoyo). */
function Barra({ proporcion }: { proporcion: number }) {
  return (
    <span aria-hidden className="block h-2 w-full rounded-sm bg-surface-sunken">
      <span className="block h-2 rounded-sm bg-accent" style={{ width: `${Math.round(Math.max(0, Math.min(1, proporcion)) * 100)}%` }} />
    </span>
  );
}

export default function TableroDelDuenio({ almacen }: PropsDeSolapa) {
  const v = useSeleccion(almacen, seleccionarTablero, porFirma);
  useOperador(almacen); // repinta si cambia quién opera (PIN)
  const operador = operadorActual(almacen);
  const [pinNuevo, setPinNuevo] = useState<DesenlaceTablero["acceso"] | null>(null);
  const hacer = useCallback(
    (a: AccionTablero): DesenlaceTablero => {
      const d: DesenlaceTablero = almacen.ejecutar((e, ahora, auth) => ejecutarTablero(e, a, ahora, auth));
      if (d.ok && d.acceso) setPinNuevo(d.acceso);
      return d;
    },
    [almacen],
  );
  const hayNovedades = v.pedidos.length + v.accesos.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {!operador.esDuenio && (
        <p className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-strong">
          El Tablero es del dueño: con tu usuario lo podés mirar, pero autorizar y dar accesos no.
        </p>
      )}
      {pinNuevo && <PinDeUnaVez acceso={pinNuevo} onListo={() => setPinNuevo(null)} />}

      <section aria-labelledby="club-novedades" className={tarjeta}>
        <h2 id="club-novedades" className="text-lg font-semibold text-strong">
          Novedades para autorizar
        </h2>
        {hayNovedades ? (
          <ul className="flex flex-col gap-2">
            {v.pedidos.map((p) => (
              <PedidoDeCredito key={p.id} p={p} hacer={hacer} />
            ))}
            {v.accesos.map((s) => (
              <PedidoDeAcceso key={s.id} s={s} hacer={hacer} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-body">Nada espera tu OK. Cuando recepción pida un crédito o alguien pida acceso, aparece acá.</p>
        )}
      </section>

      <section aria-labelledby="club-indicadores">
        <h2 id="club-indicadores" className="sr-only">
          Cómo viene hoy
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {v.indicadores.map((k) => (
            <li key={k.etiqueta}>
              <KpiTile label={k.etiqueta} value={k.valor} sub={k.detalle} />
            </li>
          ))}
        </ul>
      </section>

      {almacen.modo() === "demo" && (
        <Suspense fallback={null}>
          <CamarasDeLaDemo almacen={almacen} />
        </Suspense>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-labelledby="club-canchas-ahora" className={tarjeta}>
          <h2 id="club-canchas-ahora" className="flex items-baseline justify-between gap-2 font-semibold text-strong">
            Canchas ahora <span className="text-sm font-normal tabular-nums text-body">{v.hora}</span>
          </h2>
          <ul className="flex flex-col">
            {v.canchas.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 border-b border-line py-2 last:border-b-0">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold text-strong">{c.nombre}</span>
                  {c.juego ? (
                    c.juego.debe > 0 ? (
                      <span className="font-semibold text-danger tabular-nums">⚠ Debe {pesos(c.juego.debe)}</span>
                    ) : (
                      <span className="text-success">✔ Paga</span>
                    )
                  ) : c.luzPrendida ? (
                    <span className="font-semibold text-warning">Luz prendida sin juego</span>
                  ) : null}
                </div>
                {c.juego ? (
                  <>
                    <p className="text-sm text-body">
                      {c.juego.titular} · termina {c.juego.termina} · jugado {Math.round(c.juego.avance * 100)} %
                    </p>
                    <Barra proporcion={c.juego.avance} />
                  </>
                ) : (
                  <p className="text-sm text-body">{c.libre}</p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="club-caja-medio" className={tarjeta}>
          <h2 id="club-caja-medio" className="flex flex-wrap items-baseline justify-between gap-2 font-semibold text-strong">
            Caja del día por medio <span className="text-sm font-normal tabular-nums text-body">Neto {pesos(v.caja.neto)}</span>
          </h2>
          <dl className="flex flex-col gap-2 text-sm tabular-nums">
            {v.caja.medios.map((m) => (
              <div key={m.medio} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-body">{m.medio}</dt>
                  <dd className="font-semibold text-strong">{pesos(m.monto)}</dd>
                </div>
                <Barra proporcion={m.proporcion} />
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section aria-labelledby="club-calor" className={tarjeta}>
        <h2 id="club-calor" className="font-semibold text-strong">
          Ocupación de la semana <span className="text-sm font-normal text-body">· dónde sobran horas para vender</span>
        </h2>
        <MapaDeCalor calor={v.calor} />
      </section>

      <section aria-labelledby="club-platos" className={tarjeta}>
        <h2 id="club-platos" className="flex flex-wrap items-baseline justify-between gap-2 font-semibold text-strong">
          Venta de platos · últimos 7 días
          <span className="text-sm font-normal tabular-nums text-body">
            Total {pesos(v.platos.total)} · {v.platos.dias} {v.platos.dias === 1 ? "día" : "días"}
          </span>
        </h2>
        {v.platos.filas.length === 0 ? (
          <p className="text-sm text-body">Todavía no hay ventas de cocina.</p>
        ) : (
          <div role="region" aria-label="Venta de platos (se desliza de costado)" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-focus">
            <table className="w-full min-w-[34rem] text-sm tabular-nums">
              <caption className="sr-only">Platos más vendidos de los últimos 7 días, del que más facturó al que menos</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-body">
                  <th scope="col" className="py-1 pr-2 font-medium">
                    Plato
                  </th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">
                    Unidades
                  </th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">
                    Por día
                  </th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">
                    Facturado
                  </th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">
                    Margen
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Del total
                  </th>
                </tr>
              </thead>
              <tbody>
                {v.platos.filas.map((f) => (
                  <tr key={f.plato} className="border-b border-line last:border-b-0">
                    <td className="py-1.5 pr-2 text-strong">{f.plato}</td>
                    <td className="py-1.5 pr-2 text-right">{f.unidades}</td>
                    <td className="py-1.5 pr-2 text-right">{f.porDia}</td>
                    <td className="py-1.5 pr-2 text-right text-strong">{pesos(f.facturado)}</td>
                    <td className="py-1.5 pr-2 text-right">{pesos(f.margen)}</td>
                    <td className="w-32 py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-right text-xs whitespace-nowrap">{Math.round(f.participacion * 100)} %</span>
                        <Barra proporcion={f.participacion} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="club-log" className={tarjeta}>
        <h2 id="club-log" className="font-semibold text-strong">
          Qué pasó hoy
        </h2>
        {v.log.length === 0 ? (
          <p className="text-sm text-body">Sin movimientos todavía.</p>
        ) : (
          <ol aria-label="Lo último primero" tabIndex={0} className={cn("flex max-h-80 flex-col overflow-y-auto text-sm", "focus-visible:outline-2 focus-visible:outline-focus")}>
            {v.log.map((l, i) => (
              <li key={i} className="flex gap-2 border-b border-line py-1.5 last:border-b-0">
                <span className="w-12 shrink-0 tabular-nums text-body">{l.hora}</span>
                <span className="min-w-0 text-strong">{l.texto}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
