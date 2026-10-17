"use client";

// ============================================================================
// LA CUENTA DEL TURNO — la cancha y los cargos de cada jugador, en un solo lugar.
// ============================================================================
//
// Lo que se abre al tocar un turno (pedido del club, validado con el dueño). De arriba abajo, en el
// orden en que se usa con gente en el mostrador:
//   1. quién y qué cancha, y los totales: la cancha, los cargos y lo que falta cobrar;
//   2. cómo paga (efectivo, Mercado Pago, transferencia, débito): vale para todos los cobros;
//   3. una fila por jugador con lo suyo y su botón «Cobrar $X», y sus «a cargo de» (la cancha y los
//      cargos: el que invita paga lo del otro);
//   4. los cierres: «Cobrar todo», «Cobrar la cancha y cerrarla · la mesa sigue» y, con la cancha
//      cerrada, «Cobrar y cerrar los cargos».
// Lo que pasó se anuncia en el mismo lugar: «Cobrado $X a Ana» (role="status") o el motivo del motor
// si no se pudo (role="alert"). Nada se anima: se toca cien veces por día.
//
// La vista sale de `armarCuenta` y cada toque va a `ejecutar` (cuenta-core.ts): la pantalla no suma
// ni decide nada de plata.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Marca } from "@/components/ui/Marca";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, armarCuenta, ejecutar, textoCierre, type AccionCuenta, type Desenlace, type FilaJugador, type MedioCaja, type VistaCuenta } from "./cuenta-core";
import { porFirma, useSeleccion } from "./usar-almacen";

function SelectorACargo({
  id,
  etiqueta,
  elegido,
  opciones,
  onCambiar,
}: {
  id: string;
  etiqueta: string;
  elegido: string;
  opciones: { valor: string; etiqueta: string }[];
  onCambiar: (valor: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {etiqueta}
      </label>
      <select
        id={id}
        value={elegido}
        onChange={(e) => onCambiar(e.target.value)}
        className="h-11 min-w-0 rounded-md border border-line-strong bg-surface-raised px-2 text-sm text-strong focus-visible:outline-2 focus-visible:outline-focus"
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilaDeJugador({
  fila,
  reservaId,
  medio,
  onAccion,
}: {
  fila: FilaJugador;
  reservaId: string;
  medio: MedioCaja;
  onAccion: (a: AccionCuenta) => void;
}) {
  const base = `${reservaId}-${fila.idx}`;
  return (
    <li className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-strong">
            {fila.nombre}
            {fila.deudor && <span className="ml-2 text-xs font-semibold text-danger">⚠ cuenta con deuda</span>}
          </p>
          <p className="text-sm tabular-nums text-muted">{fila.detalle}</p>
        </div>
        {fila.aPagar > 0 ? (
          <Button variant="outline" size="md" onClick={() => onAccion({ tipo: "cobrarJugador", idx: fila.idx, medio })}>
            Cobrar {pesos(fila.aPagar)}
            <span className="sr-only"> a {fila.nombre}</span>
          </Button>
        ) : (
          <span className="pt-2 text-sm text-muted">{fila.situacion === "al día" ? "✔ al día" : fila.situacion}</span>
        )}
      </div>
      {(fila.cancha || fila.cargos) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {fila.cancha && (
            <SelectorACargo
              id={`cancha-${base}`}
              etiqueta={`Parte de la cancha de ${fila.nombre}`}
              elegido={fila.cancha.elegido}
              opciones={fila.cancha.opciones}
              onCambiar={(de) => onAccion({ tipo: "aCargoCancha", idx: fila.idx, de })}
            />
          )}
          {fila.cargos && (
            <SelectorACargo
              id={`cargos-${base}`}
              etiqueta={`Cargos de ${fila.nombre}`}
              elegido={fila.cargos.elegido}
              opciones={fila.cargos.opciones}
              onCambiar={(de) => onAccion({ tipo: "aCargoCargos", cuentaId: fila.cargos!.cuentaId, de })}
            />
          )}
        </div>
      )}
      {fila.items.length > 0 && (
        <ul aria-label={`Cargos de ${fila.nombre}`} className="text-sm tabular-nums">
          {fila.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-2 text-muted">
              <span className="min-w-0 truncate">
                {i.cant} × {i.nombre}
              </span>
              <span>{pesos(i.importe)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Totales({ vista }: { vista: VistaCuenta }) {
  const T = vista.totales;
  return (
    <dl aria-label="Totales del turno" className="grid grid-cols-3 gap-2 rounded-md bg-surface-sunken p-3 tabular-nums">
      <div>
        <dt className="text-xs text-muted">Cancha</dt>
        <dd className="font-semibold text-strong">{pesos(T.cancha)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Cargos</dt>
        <dd className="font-semibold text-strong">{pesos(T.cargos)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Falta cobrar</dt>
        <dd className={cn("text-lg font-bold", T.pendiente > 0 ? "text-strong" : "text-success")}>{pesos(T.pendiente)}</dd>
      </div>
    </dl>
  );
}

function ComoPaga({ medio, onElegir }: { medio: MedioCaja; onElegir: (m: MedioCaja) => void }) {
  const nombre = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-medium text-strong">Cómo paga</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        {MEDIOS_CAJA.map((m) => (
          <label
            key={m}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              medio === m ? "border-accent bg-accent-soft font-semibold text-strong" : "border-line-strong bg-surface-raised text-body",
            )}
          >
            <input type="radio" name={nombre} value={m} checked={medio === m} onChange={() => onElegir(m)} className="sr-only" />
            {ETIQUETA_MEDIO[m]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function CuentaDelTurno({ almacen, reservaId, onVolver }: { almacen: Almacen; reservaId: string; onVolver: () => void }) {
  const seleccionar = useCallback((e: EstadoClub) => armarCuenta(e, reservaId), [reservaId]);
  const vista = useSeleccion(almacen, seleccionar, porFirma);
  const [medio, setMedio] = useState<MedioCaja>("efectivo");
  const [desenlace, setDesenlace] = useState<Desenlace | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const idTitulo = useId();

  // Al abrir otro turno, el foco va a su cuenta (en el celular, además, la trae a la vista).
  useEffect(() => {
    titulo.current?.focus();
  }, [reservaId]);

  const seccion = useRef<HTMLElement>(null);
  const onAccion = useCallback(
    (a: AccionCuenta) => {
      setDesenlace(almacen.aplicar((estado, ahora) => ejecutar(estado, reservaId, a, ahora)));
      // Si la tecla tocada desapareció (ya no hay nada que cobrar), el foco no se pierde en la página:
      // vuelve al título de la cuenta, al lado del aviso.
      requestAnimationFrame(() => {
        if (seccion.current && !seccion.current.contains(document.activeElement)) titulo.current?.focus();
      });
    },
    [almacen, reservaId],
  );

  if (!vista) {
    return (
      <section aria-label="Cuenta del turno" className="rounded-lg border border-line bg-surface-raised p-4">
        <p className="text-sm text-muted">Ese turno ya no tiene cuenta para cobrar.</p>
        <Button variant="outline" size="md" className="mt-3" onClick={onVolver}>
          Volver a la agenda
        </Button>
      </section>
    );
  }

  const { cierres } = vista;
  const hayQueCobrar = vista.totales.pendiente > 0;
  return (
    <section
      ref={seccion}
      aria-labelledby={idTitulo}
      onKeyDown={(e) => {
        if (e.key === "Escape") onVolver();
      }}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-raised p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">Cuenta del turno</p>
          <h2 id={idTitulo} ref={titulo} tabIndex={-1} className="truncate text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
            {vista.titular}
          </h2>
          <p className="text-sm text-muted">{vista.descripcion}</p>
        </div>
        <Button variant="ghost" size="md" onClick={onVolver}>
          Volver a la agenda
        </Button>
      </header>

      {vista.mesaAbierta && <Marca tipo="medias">Cancha cerrada · la mesa sigue</Marca>}
      <Totales vista={vista} />
      {vista.sena && (
        <p className="text-sm text-muted">
          Seña {pesos(vista.sena.monto)}: {vista.sena.pagada ? "✔ pagada" : <strong className="text-strong">pendiente</strong>}
        </p>
      )}

      {hayQueCobrar && <ComoPaga medio={medio} onElegir={setMedio} />}

      <ul aria-label="Jugadores del turno">
        {vista.jugadores.map((f) => (
          <FilaDeJugador key={f.idx} fila={f} reservaId={vista.reservaId} medio={medio} onAccion={onAccion} />
        ))}
      </ul>
      {vista.deOtraMesa && <p className="text-sm text-muted">{vista.deOtraMesa}</p>}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {cierres.cobrarTodo !== null && (
          <Button variant="solid" size="md" onClick={() => onAccion({ tipo: "cobrarTodo", medio })}>
            {textoCierre("cobrarTodo", cierres.cobrarTodo)}
          </Button>
        )}
        {cierres.abrirCancha && (
          <Button variant="outline" size="md" onClick={() => onAccion({ tipo: "abrirCancha" })}>
            Abrir la cancha
          </Button>
        )}
        {cierres.cerrarYSeguir !== null && (
          <Button variant="outline" size="md" className="h-auto! min-h-11 whitespace-normal! py-2" onClick={() => onAccion({ tipo: "cerrarYSeguir", medio })}>
            {textoCierre("cerrarYSeguir", cierres.cerrarYSeguir)}
          </Button>
        )}
        {cierres.cerrarCargos !== null && (
          <Button variant="outline" size="md" onClick={() => onAccion({ tipo: "cerrarCargos", medio })}>
            {textoCierre("cerrarCargos", cierres.cerrarCargos)}
          </Button>
        )}
      </div>
      {cierres.cerrarYSeguir !== null && (
        <p className="text-sm text-muted">
          «La mesa sigue»: se cobra la cancha y queda libre para el turno siguiente. Los cargos siguen abiertos y se cobran cuando se van.
        </p>
      )}

      {/* Las dos regiones están siempre (vacías no ocupan lugar): un aviso que aparece junto con su
          región no se anuncia en todos los lectores. */}
      <div className="text-sm font-medium">
        <p role="status" className="text-success">
          {desenlace?.ok ? desenlace.mensaje : ""}
        </p>
        <p role="alert" className="text-danger">
          {desenlace && !desenlace.ok ? desenlace.mensaje : ""}
        </p>
      </div>
    </section>
  );
}
