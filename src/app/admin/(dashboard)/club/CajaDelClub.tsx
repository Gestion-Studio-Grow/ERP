"use client";

// ============================================================================
// LA CAJA DE 12 A 12 — cuánto hay, los egresos y el cierre con lo contado.
// ============================================================================
//
// Arriba, en rojo, si quedó una caja con movimientos sin cerrar (la de la mañana, la de ayer): se cierra desde
// ahí con lo contado. Después, la caja de hoy: el efectivo que tiene que haber en el cajón (el fondo más lo
// cobrado en efectivo menos los egresos), lo cobrado por medio y los últimos movimientos. Abajo, anotar un
// egreso (con concepto) y cerrar la caja. Una caja se cierra una sola vez; lo cobrado después entra en la
// siguiente. Los créditos de los clientes no entran a la caja.
//
// En el piloto, egreso y cierre piden el PIN; en el ERP manda la sesión (ver `operadorDeLaDemo`).

import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { armarCaja, ejecutarCaja, type AccionCaja } from "./caja-core";
import { porFirma, useSeleccion } from "./usar-almacen";

const seleccionarCaja = (e: EstadoClub, a: Ahora) => armarCaja(e, a);

function CerrarCaja({ etiqueta, boton, onCerrar }: { etiqueta: string; boton: string; onCerrar: (contado: string) => boolean }) {
  const [contado, setContado] = useState("");
  const id = useId();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (onCerrar(contado)) setContado("");
      }}
    >
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-strong">
          {etiqueta}
        </label>
        <Input id={id} inputMode="numeric" importe value={contado} autoComplete="off" onChange={(e) => setContado(e.target.value)} />
      </div>
      <Button type="submit" variant="solid" size="md">
        {boton}
      </Button>
    </form>
  );
}

/** Las cajas que quedaron con movimientos sin cerrar: el aviso en rojo y UN formulario para cerrar la que se elija. */
function CajasAtrasadas({ atrasadas, hacer }: { atrasadas: { dia: string; texto: string; efectivoEsperado: number }[]; hacer: (a: AccionCaja) => boolean }) {
  const [dia, setDia] = useState(atrasadas[0].dia);
  const id = useId();
  const elegida = atrasadas.find((a) => a.dia === dia) ?? atrasadas[0];
  const ddmm = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger-soft p-3">
      <h2 id={`${id}-t`} role="alert" className="font-semibold text-danger">
        {atrasadas.length === 1 ? elegida.texto : `Quedaron ${atrasadas.length} cajas sin cerrar: ${atrasadas.map((a) => ddmm(a.dia)).join(", ")}.`}
      </h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-strong">
          Caja para cerrar
        </label>
        <Select id={id} value={elegida.dia} onChange={(e) => setDia(e.target.value)}>
          {atrasadas.map((a) => (
            <option key={a.dia} value={a.dia}>
              Caja del {ddmm(a.dia)} · tendría que haber {pesos(a.efectivoEsperado)} en efectivo
            </option>
          ))}
        </Select>
      </div>
      <CerrarCaja etiqueta={`Efectivo contado de la caja del ${ddmm(elegida.dia)}`} boton="Cerrar esa caja" onCerrar={(contado) => hacer({ tipo: "cerrar", contado, dia: elegida.dia })} />
    </section>
  );
}

export default function CajaDelClub({ almacen }: { almacen: Almacen }) {
  const v = useSeleccion(almacen, seleccionarCaja, porFirma);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const ids = { monto: useId(), concepto: useId() };
  const hacer = useCallback((a: AccionCaja) => almacen.ejecutar((e, ahora, auth) => ejecutarCaja(e, a, ahora, auth)).ok, [almacen]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Operás como {almacen.operador()}. En el ERP la sesión reemplaza al PIN del piloto: el egreso y el cierre quedan a tu nombre.
      </p>
      {v.atrasadas.length > 0 && <CajasAtrasadas atrasadas={v.atrasadas} hacer={hacer} />}

      <section aria-labelledby="club-caja-hoy" className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
        <h2 id="club-caja-hoy" className="text-lg font-semibold text-strong">
          {v.titulo}
        </h2>
        <dl className="grid grid-cols-2 gap-3 tabular-nums sm:grid-cols-4">
          <div className="col-span-2 rounded-md bg-surface-sunken p-3 sm:col-span-1">
            {/* text-body: sobre el fondo hundido, text-muted no llega a 4,5:1. */}
            <dt className="text-xs text-body">Efectivo en el cajón</dt>
            <dd className="text-xl font-bold text-strong">{pesos(v.efectivoEsperado)}</dd>
          </div>
          <div className="p-3">
            <dt className="text-xs text-muted">Fondo</dt>
            <dd className="font-semibold text-strong">{pesos(v.fondo)}</dd>
          </div>
          <div className="p-3">
            <dt className="text-xs text-muted">Ingresos</dt>
            <dd className="font-semibold text-strong">{pesos(v.ingresos)}</dd>
          </div>
          <div className="p-3">
            <dt className="text-xs text-muted">Egresos</dt>
            <dd className="font-semibold text-strong">{pesos(v.egresos)}</dd>
          </div>
        </dl>
        <dl aria-label="Lo cobrado por medio" className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums sm:grid-cols-4">
          {v.porMedio.map((m) => (
            <div key={m.medio} className="flex justify-between gap-2 border-b border-line py-1">
              <dt className="text-muted">{m.medio}</dt>
              <dd className="text-strong">{pesos(m.monto)}</dd>
            </div>
          ))}
        </dl>
        <h3 className="text-sm font-semibold text-strong">Últimos movimientos</h3>
        {v.movimientos.length === 0 ? (
          <p className="text-sm text-muted">Todavía no entró ni salió nada en esta caja.</p>
        ) : (
          <ul className="flex flex-col text-sm tabular-nums">
            {v.movimientos.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 border-b border-line py-1.5 last:border-b-0">
                <span className="min-w-0 truncate">
                  <span className="text-muted">{m.hora}</span> {m.concepto} <span className="text-muted">· {m.medio}</span>
                </span>
                <span className={cn("shrink-0", m.tipo === "egreso" ? "text-danger" : "text-strong")}>
                  {m.tipo === "egreso" ? "−" : ""}
                  {pesos(m.monto)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-labelledby="club-egreso" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4">
          <h2 id="club-egreso" className="font-semibold text-strong">
            Anotar un egreso en efectivo
          </h2>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (hacer({ tipo: "egreso", monto, concepto })) {
                setMonto("");
                setConcepto("");
              }
            }}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr]">
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.monto} className="text-sm font-medium text-strong">
                  Monto
                </label>
                <Input id={ids.monto} inputMode="numeric" importe value={monto} autoComplete="off" onChange={(e) => setMonto(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.concepto} className="text-sm font-medium text-strong">
                  Concepto (para qué salió la plata)
                </label>
                <Input id={ids.concepto} value={concepto} autoComplete="off" onChange={(e) => setConcepto(e.target.value)} />
              </div>
            </div>
            <Button type="submit" variant="outline" size="md">
              Anotar el egreso
            </Button>
          </form>
        </section>
        <section aria-labelledby="club-cierre" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4">
          <h2 id="club-cierre" className="font-semibold text-strong">
            Cerrar la caja
          </h2>
          <p className="text-sm text-muted">Contá el efectivo del cajón (con el fondo). Se cierra una sola vez; lo que se cobre después va a la caja siguiente.</p>
          <CerrarCaja etiqueta="Efectivo contado" boton="Cerrar la caja" onCerrar={(contado) => hacer({ tipo: "cerrar", contado, dia: null })} />
        </section>
      </div>

      {v.cierres.length > 0 && (
        <section aria-labelledby="club-cierres" className="flex flex-col gap-1">
          <h2 id="club-cierres" className="font-semibold text-strong">
            Cierres
          </h2>
          <ul className="text-sm tabular-nums">
            {v.cierres.map((c) => (
              <li key={c.dia} className="flex justify-between gap-2 border-b border-line py-1.5">
                <span className="min-w-0 truncate text-muted">{c.texto}</span>
                <span className={cn("shrink-0 font-semibold", c.diferencia === 0 ? "text-success" : "text-danger")}>
                  {c.diferencia === 0 ? "cuadra" : `${c.diferencia > 0 ? "sobran" : "faltan"} ${pesos(Math.abs(c.diferencia))}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
