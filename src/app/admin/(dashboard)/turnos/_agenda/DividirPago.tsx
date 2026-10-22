"use client";

// ============================================================================
// DIVIDIR EL PAGO y SUMAR LO QUE DEBE — los dos extras de la hoja de cobro (§2.6, CH Tanda 2).
// ============================================================================
//
// `DividirPago` (default): «Paga $10.000 en efectivo y el resto por Mercado Pago». La recepción elige
// el primer medio y tipea su monto; el segundo monto se completa solo (lo que falta) y se elige su
// medio. Recién con los dos medios elegidos, distintos, se habilita [Cobrar $18.000 en 2 medios]: los
// dos cobros y el turno terminado salen en UNA transacción (`terminarYCobrarDividido`). Ningún medio
// viene elegido (principio 4).
//
// `SumarLoQueDebe`: «+ Sumar lo que debe de antes ($9.000)». Si la clienta quedó debiendo turnos
// anteriores, un toque los suma y un toque en el medio cobra todo: un cobro por turno, cada uno
// imputado a SU turno, y el de hoy terminado (`cobrarVariosTurnos`). La deuda se lee una vez al abrir
// la hoja (`deudaViejaDelTurno`), salvo que quien la monta ya la traiga (`deudas`).
//
// Se montan debajo de las teclas de medio de `TerminarTurno` y sólo cuando quien mira puede cobrar
// este turno: misma condición que las teclas.

import { useEffect, useId, useState, useTransition } from "react";
import { Button, Input, Plata, Segmented } from "@/components/ui";
import { leerImporte } from "@/lib/dinero/leer";
import { fmtShortDate } from "@/lib/datetime";
import { METODO_LABEL, esMetodoDePago, type MetodoDePago } from "@/lib/turnos/cobros";
import { camposDeCobrarVarios, pesosDelCobro, repartoEnPantalla, totalDeLaDeuda, type DeudaVieja } from "@/lib/turnos/cobro-dividido";
import { cobrarVariosTurnos, deudaViejaDelTurno, terminarYCobrarDividido } from "@/lib/turnos/cobro-actions";
import { useToast } from "../../ToastProvider";
import TeclasDeMedio from "../cerrar/TeclasDeMedio";
import { aFormData, camposDeDividir } from "./campos";
import { useMediosDePago } from "./medios";

type PropsDelCobro = {
  turnoId: string;
  clienta: string;
  /** El estado al dibujar: un Reservado (PENDING) se cierra como «vino». */
  estado: string;
  /** Lo que falta cobrar de ESTE turno. */
  saldo: number;
  /** Salió bien (cerrar la hoja). */
  onListo?: () => void;
  /** Otra tecla de la hoja está cobrando: ésta espera. */
  disabled?: boolean;
};

/** Las opciones de los dos medios: los de esta base (Débito/Crédito sólo con M1, `useMediosDePago`). */
function opcionesDeMedio(medios: readonly MetodoDePago[]) {
  return medios.map((m) => ({ valor: m, etiqueta: METODO_LABEL[m] }));
}

function medioDelEvento(e: React.ChangeEvent<HTMLFieldSetElement>, medios: readonly MetodoDePago[]): MetodoDePago | null {
  const v = (e.nativeEvent.target as HTMLInputElement | null)?.value;
  return esMetodoDePago(v, medios) ? v : null;
}

export default function DividirPago({ turnoId, clienta, estado, saldo, onListo, disabled = false }: PropsDelCobro) {
  const id = useId();
  const { showError, showSuccess } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [primero, setPrimero] = useState<MetodoDePago | null>(null);
  const [texto, setTexto] = useState("");
  const [segundo, setSegundo] = useState<MetodoDePago | null>(null);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const { medios } = useMediosDePago();
  const OPCIONES_DE_MEDIO = opcionesDeMedio(medios);
  // Con cinco medios (Débito/Crédito activados) la fila no entra en un celular: se parte en dos.
  const partir = medios.length > 3 ? "flex-wrap" : undefined;

  const lectura = leerImporte(texto);
  const monto = lectura.estado === "ok" ? lectura.valor : null;
  const reparto = repartoEnPantalla({ saldo, primero: { metodo: primero, monto }, segundoMetodo: segundo });
  const resto = reparto.listo ? reparto.lineas[1].monto : reparto.resto;
  const avisoDelMonto = texto !== "" && lectura.estado !== "ok" ? "Eso no es un monto. Escribilo como 10.000 o 10.000,50." : !reparto.listo ? reparto.error : undefined;

  const cobrar = () => {
    if (!reparto.listo || pendiente || disabled) return;
    setError("");
    empezar(async () => {
      try {
        const r = await terminarYCobrarDividido(aFormData(camposDeDividir({ turnoId, lineas: reparto.lineas, estado })));
        if (!r.ok) {
          setError(r.error);
          return;
        }
        showSuccess(`${estado === "PENDING" ? "Vino" : "Terminado"} y cobrado: ${clienta}, ${reparto.texto}.`);
        if (r.aviso) showError(r.aviso);
        onListo?.();
      } catch {
        showError("No se pudo cobrar. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  return (
    <div data-ui="dividir-pago" className="space-y-3">
      {/* Con borde, como «Queda debiendo»: con `ghost` se leía como texto suelto (cert CH T2, O-9). */}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        aria-expanded={abierto}
        aria-controls={`${id}-dividir`}
        disabled={disabled || pendiente}
        onClick={() => setAbierto((a) => !a)}
      >
        Dividir el pago
      </Button>
      {abierto && (
        <fieldset id={`${id}-dividir`} className="space-y-4 border-t border-line pt-4">
          <legend className="sr-only">Dividir el pago de {pesosDelCobro(saldo)} en dos medios</legend>
          <div className="space-y-2">
            <Segmented
              name={`${id}-primero`}
              leyenda="Paga una parte con"
              leyendaVisible
              lleno
              value={primero ?? ""}
              onChange={(e) => {
                const m = medioDelEvento(e, medios);
                setPrimero(m);
                if (m && m === segundo) setSegundo(null);
              }}
              opciones={OPCIONES_DE_MEDIO}
              className={partir}
            />
            <label htmlFor={`${id}-monto`} className="block text-sm font-medium text-strong">
              {primero ? `Cuánto paga con ${METODO_LABEL[primero].toLowerCase()}` : "Cuánto paga con ese medio"}
            </label>
            <Input
              id={`${id}-monto`}
              importe
              inputMode="decimal"
              autoComplete="off"
              placeholder="10.000"
              value={texto}
              aria-invalid={avisoDelMonto ? true : undefined}
              aria-describedby={avisoDelMonto ? `${id}-aviso-monto` : undefined}
              onChange={(e) => setTexto(e.target.value)}
              className="text-right tabular-nums"
            />
            {avisoDelMonto && (
              <p id={`${id}-aviso-monto`} className="text-xs text-danger">
                {avisoDelMonto}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Segmented
              name={`${id}-segundo`}
              leyenda="Y el resto con"
              leyendaVisible
              lleno
              value={segundo ?? ""}
              onChange={(e) => setSegundo(medioDelEvento(e, medios))}
              opciones={OPCIONES_DE_MEDIO.map((o) => ({ ...o, disabled: o.valor === primero }))}
              className={partir}
            />
            <p className="flex items-baseline justify-between gap-3 text-sm text-muted" aria-live="polite">
              <span>{segundo ? `Con ${METODO_LABEL[segundo].toLowerCase()} (se completa solo)` : "El resto (se completa solo)"}</span>
              <Plata valor={resto} sinCentavos={Number.isInteger(resto)} />
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!reparto.listo || pendiente || disabled}
            estado={pendiente ? "cargando" : undefined}
            onClick={cobrar}
          >
            {pendiente ? "Cobrando…" : `Cobrar ${pesosDelCobro(saldo)} en 2 medios`}
          </Button>
        </fieldset>
      )}
    </div>
  );
}

/**
 * «+ Sumar lo que debe de antes». No dibuja nada si la clienta no debe nada (o todavía no se sabe).
 */
export function SumarLoQueDebe({ turnoId, clienta, estado, saldo, onListo, disabled = false, deudas: deudasDadas }: PropsDelCobro & { deudas?: DeudaVieja[] }) {
  const id = useId();
  const { showError, showSuccess } = useToast();
  const [leidas, setLeidas] = useState<DeudaVieja[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [enCurso, setEnCurso] = useState<MetodoDePago | null>(null);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const { medios } = useMediosDePago();

  useEffect(() => {
    if (deudasDadas) return;
    let vivo = true;
    deudaViejaDelTurno(turnoId)
      .then((d) => vivo && setLeidas(d))
      .catch(() => vivo && setLeidas([]));
    return () => {
      vivo = false;
    };
  }, [turnoId, deudasDadas]);

  const deudas = deudasDadas ?? leidas;
  if (!deudas || deudas.length === 0) return null;
  const deAntes = totalDeLaDeuda(deudas);
  const total = totalDeLaDeuda([{ saldo: Math.max(0, saldo) }, { saldo: deAntes }]);

  const cobrar = (metodo: MetodoDePago) => {
    if (pendiente || disabled) return;
    setError("");
    setEnCurso(metodo);
    empezar(async () => {
      try {
        const cobros = [...(saldo > 0 ? [{ id: turnoId, monto: saldo }] : []), ...deudas.map((d) => ({ id: d.turnoId, monto: d.saldo }))];
        const r = await cobrarVariosTurnos(aFormData(camposDeCobrarVarios({ cobros, metodo, terminar: { turnoId, estado } })));
        if (!r.ok) {
          setError(r.error);
          return;
        }
        showSuccess(`Cobrado: ${clienta}, ${pesosDelCobro(total)} en ${METODO_LABEL[metodo].toLowerCase()} (hoy y lo de antes). Ya no debe nada.`);
        if (r.aviso) showError(r.aviso);
        onListo?.();
      } catch {
        showError("No se pudo cobrar. Probá de nuevo; si sigue, avisá.");
      } finally {
        setEnCurso(null);
      }
    });
  };

  return (
    <div data-ui="sumar-lo-que-debe" className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        aria-expanded={abierto}
        aria-controls={`${id}-deuda`}
        disabled={disabled || pendiente}
        onClick={() => setAbierto((a) => !a)}
      >
        + Sumar lo que debe de antes ({pesosDelCobro(deAntes)})
      </Button>
      {abierto && (
        <div id={`${id}-deuda`} className="space-y-3 border-t border-line pt-3">
          <ul className="space-y-1 text-sm">
            {deudas.map((d) => (
              <li key={d.turnoId} className="flex items-baseline justify-between gap-3">
                <span className="text-body">
                  <span className="tabular-nums">{fmtShortDate(d.inicio)}</span> · {d.servicio}
                </span>
                <Plata valor={d.saldo} sinCentavos={Number.isInteger(d.saldo)} />
              </li>
            ))}
          </ul>
          <p className="flex items-baseline justify-between gap-3 text-sm font-semibold text-strong">
            <span>{saldo > 0 ? `Hoy ${pesosDelCobro(saldo)} + lo de antes` : "Lo de antes"}</span>
            <Plata valor={total} sinCentavos={Number.isInteger(total)} />
          </p>
          <TeclasDeMedio
            tamano="grande"
            etiqueta={`Cobrar ${pesosDelCobro(total)} a ${clienta}, cada parte a su turno, con`}
            onElegir={cobrar}
            disabled={pendiente || disabled}
            enCurso={enCurso}
            medios={medios}
          />
          <p className="text-center text-xs text-muted">Un toque en el medio cobra todo y termina el turno de hoy.</p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * «Cobrar lo que debe ($9.000)» SIN un turno de hoy (el buscador global, CH-028): la tecla despliega
 * los medios y un toque cobra todo, un cobro por turno imputado a SU turno (`cobrarVariosTurnos` sin
 * `terminar`, una transacción). La deuda la trae quien la monta (`cobros`: id y saldo de cada turno).
 */
export function CobrarLoQueDebe({
  clienta,
  cobros,
  onListo,
}: {
  clienta: string;
  cobros: readonly { id: string; monto: number }[];
  /** Salió bien (cerrar lo que la mostraba y recargar). */
  onListo?: () => void;
}) {
  const id = useId();
  const { showError, showSuccess } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [enCurso, setEnCurso] = useState<MetodoDePago | null>(null);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const { medios } = useMediosDePago();
  const total = totalDeLaDeuda(cobros.map((c) => ({ saldo: c.monto })));
  if (cobros.length === 0 || !(total > 0)) return null;

  const cobrar = (metodo: MetodoDePago) => {
    if (pendiente) return; // un doble toque no manda dos veces (y las claves de idempotencia tampoco cobrarían dos)
    setError("");
    setEnCurso(metodo);
    empezar(async () => {
      try {
        const r = await cobrarVariosTurnos(aFormData(camposDeCobrarVarios({ cobros, metodo })));
        if (!r.ok) {
          setError(r.error);
          return;
        }
        showSuccess(`Cobrado: ${clienta}, ${pesosDelCobro(total)} en ${METODO_LABEL[metodo].toLowerCase()}. Ya no debe nada.`);
        if (r.aviso) showError(r.aviso);
        onListo?.();
      } catch {
        showError("No se pudo cobrar. Probá de nuevo; si sigue, avisá.");
      } finally {
        setEnCurso(null);
      }
    });
  };

  return (
    <div data-ui="cobrar-lo-que-debe" className="w-full space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={abierto}
        aria-controls={`${id}-medios`}
        disabled={pendiente}
        onClick={() => setAbierto((a) => !a)}
      >
        Cobrar lo que debe ({pesosDelCobro(total)})
      </Button>
      {abierto && (
        <div id={`${id}-medios`} className="space-y-2">
          <TeclasDeMedio etiqueta={`Cobrar ${pesosDelCobro(total)} que debe ${clienta}, con`} onElegir={cobrar} disabled={pendiente} enCurso={enCurso} medios={medios} />
          <p className="text-xs text-muted">
            {cobros.length === 1 ? "Un toque en el medio cobra lo que quedó debiendo." : `Un toque en el medio cobra los ${cobros.length} turnos que quedaron debiendo, cada uno en el suyo.`}
          </p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
