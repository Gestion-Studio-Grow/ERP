"use client";

// El formulario de «Mi negocio»: alias/CBU de la seña, cuánto antes se cancela, qué se propone con la
// seña y hasta cuánto da de baja un saldo la recepción. Abajo, en vivo, cómo lo va a proponer la hoja
// de cancelar con esas reglas (`propuestaDeSenia`, la misma función que usa el mostrador).
// Sin la migración M2 los campos se ven (con el placeholder D2/D5 que rige) pero no se editan.

import { useActionState, useId, useState } from "react";
import { AvisoError, Button, cn } from "@/components/ui";
import type { DestinoSenia, ReglasDelNegocio } from "@/lib/settings";
import { TITULO_DESTINO, propuestaDeSenia } from "@/lib/mi-negocio/mi-negocio";
import { guardarMiNegocio, type EstadoMiNegocio } from "./actions";

const DESTINOS: DestinoSenia[] = ["retener", "devolver", "a-favor"];
const INICIAL: EstadoMiNegocio = { estado: "inicial", mensaje: "" };

const campo = "h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong disabled:bg-surface-sunken disabled:text-muted";

function Destinos({ name, leyenda, valor, onChange }: { name: string; leyenda: string; valor: DestinoSenia; onChange: (d: DestinoSenia) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-strong">{leyenda}</legend>
      <div className="flex flex-wrap gap-2">
        {DESTINOS.map((d) => (
          <label
            key={d}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm font-medium",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              "has-[:disabled]:cursor-not-allowed",
              valor === d ? "border-accent bg-accent-soft text-strong" : "border-line-strong bg-surface-raised text-body",
            )}
          >
            <input type="radio" name={name} value={d} checked={valor === d} onChange={() => onChange(d)} className="sr-only" />
            {TITULO_DESTINO[d]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function MiNegocioForm({ reglas }: { reglas: ReglasDelNegocio }) {
  const ids = useId();
  const [estado, enviar, pendiente] = useActionState(guardarMiNegocio, INICIAL);
  const [horas, setHoras] = useState(String(reglas.cancelacionHoras));
  const [tarde, setTarde] = useState<DestinoSenia>(reglas.seniaCancelaTarde);
  const [noVino, setNoVino] = useState<DestinoSenia>(reglas.seniaNoVino);
  const activas = reglas.activas;

  const regla = { cancelacionHoras: /^\d{1,3}$/.test(horas) ? Number(horas) : reglas.cancelacionHoras, seniaCancelaTarde: tarde, seniaNoVino: noVino };
  const ejemplos = [
    { cuando: `La clienta avisa ${regla.cancelacionHoras + 2} h antes`, p: propuestaDeSenia(regla, "clienta", regla.cancelacionHoras + 2) },
    { cuando: "La clienta avisa 6 h antes", p: propuestaDeSenia(regla, "clienta", 6) },
    { cuando: "No vino", p: propuestaDeSenia(regla, "no-vino", -1) },
    { cuando: "Cancela el negocio", p: propuestaDeSenia(regla, "negocio", 0) },
  ];

  return (
    <form action={enviar} className="space-y-8" aria-describedby={activas ? undefined : `${ids}-pendiente`}>
      {!activas && (
        <div id={`${ids}-pendiente`}>
          <AvisoError
            tono="aviso"
            titulo="Pendiente de activar"
            comoSeguir="Estas reglas se van a poder cambiar cuando se active la actualización del sistema. Mientras tanto rigen las que ves (provisionales, a confirmar con vos)."
          />
        </div>
      )}
      {estado.estado !== "inicial" && (
        <p
          role={estado.estado === "error" ? "alert" : "status"}
          className={cn(
            "border-l-2 px-4 py-3 text-sm",
            estado.estado === "ok" ? "border-success bg-success-soft text-strong" : estado.estado === "error" ? "border-danger bg-danger-soft text-strong" : "border-warning bg-warning-soft text-strong",
          )}
        >
          {estado.mensaje}
        </p>
      )}

      <fieldset disabled={!activas || pendiente} className="min-w-0 space-y-8">
        <section aria-labelledby={`${ids}-senia`} className="space-y-3">
          <h2 id={`${ids}-senia`} className="border-b border-line-strong pb-2 text-[15px] font-semibold text-strong">
            Dónde te mandan la seña
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-alias`} className="text-sm font-medium text-strong">
                Alias
              </label>
              <input id={`${ids}-alias`} name="aliasSenia" defaultValue={reglas.aliasSenia ?? ""} placeholder="ch.estetica.mp" autoComplete="off" className={campo} aria-describedby={`${ids}-alias-ayuda`} />
              <p id={`${ids}-alias-ayuda`} className="text-xs text-muted">
                Va en el WhatsApp cuando le pedís la seña a la clienta.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-cbu`} className="text-sm font-medium text-strong">
                CBU o CVU <span className="font-normal text-muted">(opcional)</span>
              </label>
              <input id={`${ids}-cbu`} name="cbuSenia" defaultValue={reglas.cbuSenia ?? ""} inputMode="numeric" autoComplete="off" className={cn(campo, "tabular-nums")} aria-describedby={`${ids}-cbu-ayuda`} />
              <p id={`${ids}-cbu-ayuda`} className="text-xs text-muted">
                22 números. Se usa si no hay alias.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby={`${ids}-cancelar`} className="space-y-4">
          <h2 id={`${ids}-cancelar`} className="border-b border-line-strong pb-2 text-[15px] font-semibold text-strong">
            Si cancelan o no vienen
          </h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-horas`} className="text-sm font-medium text-strong">
              ¿Con cuántas horas de aviso se devuelve la seña?
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${ids}-horas`}
                name="cancelacionHoras"
                value={horas}
                onChange={(e) => setHoras(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                className={cn(campo, "w-24 text-right tabular-nums")}
              />
              <span className="text-sm text-body">horas antes del turno</span>
            </div>
          </div>
          <Destinos name="seniaCancelaTarde" leyenda="Si la clienta avisa más tarde, la seña…" valor={tarde} onChange={setTarde} />
          <Destinos name="seniaNoVino" leyenda="Si la clienta no viene, la seña…" valor={noVino} onChange={setNoVino} />
          <div>
            <p className="text-sm font-medium text-strong">Así lo va a proponer la recepción (siempre lo puede cambiar)</p>
            <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
              {ejemplos.map((e) => (
                <li key={e.cuando} className="flex flex-wrap items-baseline justify-between gap-x-3 px-1 py-2">
                  <span className="text-body">{e.cuando}</span>
                  <span className="font-medium text-strong">{e.p.titulo}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby={`${ids}-recepcion`} className="space-y-3">
          <h2 id={`${ids}-recepcion`} className="border-b border-line-strong pb-2 text-[15px] font-semibold text-strong">
            Lo que puede hacer la recepción
          </h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-tope`} className="text-sm font-medium text-strong">
              Hasta cuánto puede dar de baja un saldo
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-body">$</span>
              <input
                id={`${ids}-tope`}
                name="topeBajaSaldoRecepcion"
                defaultValue={String(reglas.topeBajaSaldoRecepcion)}
                inputMode="decimal"
                autoComplete="off"
                className={cn(campo, "w-32 text-right tabular-nums")}
                aria-describedby={`${ids}-tope-ayuda`}
              />
            </div>
            <p id={`${ids}-tope-ayuda`} className="text-xs text-muted">
              Con $0, sólo vos das de baja saldos (lo que rige hoy).
            </p>
          </div>
        </section>

        <Button type="submit" disabled={!activas || pendiente}>
          {pendiente ? "Guardando…" : activas ? "Guardar" : "Pendiente de activar"}
        </Button>
      </fieldset>
    </form>
  );
}
