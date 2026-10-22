"use client";

// ============================================================================
// PIE DE COBRO — la única pieza que cobra (Magra, tanda 1 · 1A; contrato en magra-DISENO.md §4.0).
// ============================================================================
//
// Vive en Vender, en la entrega de un pedido, en la rendición del cadete y en la devolución. Si
// se arregla acá, se arregla en todos lados.
//
//   · Medios que cobran de un toque: Mercado Pago y Transferencia cobran el total exacto.
//   · Efectivo abre los chips «Justo · $40.000 · $50.000 · $100.000 · Otro» (ninguno elegido de
//     antemano); cada chip cobra y deja el VUELTO en la cifra más grande del pie (48 px).
//   · «Otro»: se escribe con cuánto paga; si no alcanza, «Te faltan $X» y hay que confirmar
//     «Cobrar igual» (se cobra el total: lo que falta lo completa el cliente).
//   · Dividir: dos o más medios con `repartirPagos`; el único renglón sin monto paga lo que falta.
//
// Las cuentas viven en `src/lib/cobro/pie-de-cobro-core.ts` (puras, probadas). Al cobrar, el pie
// escribe sus campos ocultos en el formulario que lo contiene (`camposDelPie`) ANTES de llamar a
// `onCobrar`: si el llamador hace `form.requestSubmit()` adentro de `onCobrar`, el FormData ya los
// trae. El servidor los lee con `leerPagos` y no confía en lo que calculó la pantalla.
//
// No se anima nada (se usa cien veces por día). Tokens de color, nunca hex.

import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/components/ui/cn";
import { MEDIOS_DE_COBRO, etiquetaDeMedio, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import {
  billetesSugeridos,
  camposDelPie,
  estadoDelEfectivo,
  leerDivision,
  mediosLibres,
  motivoParaNoCobrar,
  resultadoDeLaDivision,
  textoPlata,
  vueltoDelResultado,
  MAX_PAGOS,
  type RenglonDeDivision,
  type ResultadoDelPie,
} from "@/lib/cobro/pie-de-cobro-core";

export type { PagoDelPie, ResultadoDelPie } from "@/lib/cobro/pie-de-cobro-core";

export interface PieDeCobroProps {
  /** Al centavo. */
  total: number;
  /** «Falta la cantidad de…», «El día está cerrado…». Deshabilita los medios con ese motivo. */
  deshabilitado?: { motivo: string };
  /** «Cobrar», «Cobrar y entregar», «Registrar para cobrar mañana». */
  textoBoton?: string;
  /** Default true. */
  permitirDividir?: boolean;
  onCobrar(r: ResultadoDelPie): void | Promise<void>;
}

type Vista =
  | { tipo: "medios" }
  | { tipo: "efectivo"; otro: string | null }
  | { tipo: "dividir"; renglones: RenglonDeDivision[] };

const TECLA =
  "inline-flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-line-strong " +
  "bg-surface-raised px-3 text-sm font-semibold text-strong hover:bg-accent-soft " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-accent";

const CHIP =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface-raised px-4 " +
  "text-sm font-medium tabular-nums text-strong hover:bg-accent-soft " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50";

const PRIMARIO =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-base font-semibold text-on-accent " +
  "hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint";

const CAMPO =
  "h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base tabular-nums text-strong " +
  "placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";

function CifraGrande({ rotulo, valor, tono }: { rotulo: string; valor: number; tono?: "peligro" }) {
  return (
    <p className="flex items-baseline justify-end gap-3" data-parte="cifra-grande">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{rotulo}</span>
      <span className={cn("font-display text-5xl leading-none tabular-nums", tono === "peligro" ? "text-danger" : "text-strong")}>
        {textoPlata(valor)}
      </span>
    </p>
  );
}

export function PieDeCobro({ total, deshabilitado, textoBoton = "Cobrar", permitirDividir = true, onCobrar }: PieDeCobroProps) {
  const [vista, setVista] = useState<Vista>({ tipo: "medios" });
  const [campos, setCampos] = useState<[string, string][]>([]);
  const [enviando, setEnviando] = useState(false);
  const [ultimoVuelto, setUltimoVuelto] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enVuelo = useRef(false);

  const motivo = motivoParaNoCobrar(total, deshabilitado);
  const bloqueado = motivo !== null || enviando;
  const etiquetaCobrar = `${textoBoton} ${textoPlata(total)}`;

  function ir(v: Vista) {
    setError(null);
    setUltimoVuelto(null);
    setVista(v);
  }

  async function cobrar(r: ResultadoDelPie) {
    // El doble toque: el segundo no entra mientras el primero está en vuelo (la clave del ticket
    // y la del cobro, en el servidor, son la red de abajo).
    if (enVuelo.current || motivo !== null) return;
    enVuelo.current = true;
    setError(null);
    const vuelto = vueltoDelResultado(total, r);
    flushSync(() => {
      setEnviando(true);
      setCampos(camposDelPie(total, r));
      setUltimoVuelto(vuelto > 0 ? vuelto : null);
    });
    try {
      await onCobrar(r);
      setVista({ tipo: "medios" });
    } catch {
      setError("No se pudo cobrar: probá de nuevo.");
    } finally {
      enVuelo.current = false;
      setEnviando(false);
      setCampos([]);
    }
  }

  let cuerpo: ReactNode;
  if (vista.tipo === "efectivo") {
    const otro = vista.otro;
    const estado = otro === null ? null : estadoDelEfectivo(total, otro);
    cuerpo = (
      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Con cuánto paga en efectivo" className="flex flex-wrap gap-2">
          <button type="button" className={CHIP} disabled={bloqueado} onClick={() => cobrar({ modo: "simple", medio: "EFECTIVO", recibido: total })}>
            Justo
          </button>
          {billetesSugeridos(total).map((b) => (
            <button
              key={b}
              type="button"
              className={CHIP}
              disabled={bloqueado}
              onClick={() => cobrar({ modo: "simple", medio: "EFECTIVO", recibido: b })}
            >
              {textoPlata(b)}
            </button>
          ))}
          <button
            type="button"
            className={CHIP}
            aria-pressed={otro !== null}
            disabled={bloqueado}
            onClick={() => setVista({ tipo: "efectivo", otro: otro ?? "" })}
          >
            Otro
          </button>
          <button type="button" className={cn(CHIP, "ml-auto")} disabled={enviando} onClick={() => ir({ tipo: "medios" })}>
            Volver
          </button>
        </div>
        {otro !== null && (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm text-muted">
              Pagó con
              <input
                className={CAMPO}
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={otro}
                disabled={bloqueado}
                aria-invalid={estado?.estado === "invalido" ? true : undefined}
                onChange={(e) => setVista({ tipo: "efectivo", otro: e.target.value })}
              />
            </label>
            <div aria-live="polite">
              {estado?.estado === "vuelto" && <CifraGrande rotulo="Vuelto" valor={estado.vuelto} />}
              {estado?.estado === "invalido" && <p className="text-sm text-danger">Eso no es un importe.</p>}
              {estado?.estado === "falta" && (
                <p className="text-base font-semibold text-danger">Te faltan {textoPlata(estado.falta)}.</p>
              )}
            </div>
            {estado?.estado === "falta" ? (
              <button
                type="button"
                className={cn(PRIMARIO, "bg-danger hover:bg-danger")}
                disabled={bloqueado}
                onClick={() => cobrar({ modo: "simple", medio: "EFECTIVO" })}
              >
                Cobrar igual {textoPlata(total)}
              </button>
            ) : (
              <button
                type="button"
                className={PRIMARIO}
                disabled={bloqueado || !(estado?.estado === "vuelto" || estado?.estado === "justo")}
                onClick={() => {
                  if (estado?.estado === "vuelto" || estado?.estado === "justo") {
                    cobrar({ modo: "simple", medio: "EFECTIVO", recibido: total + (estado.estado === "vuelto" ? estado.vuelto : 0) });
                  }
                }}
              >
                {etiquetaCobrar}
              </button>
            )}
          </div>
        )}
      </div>
    );
  } else if (vista.tipo === "dividir") {
    const renglones = vista.renglones;
    const leida = leerDivision(total, renglones);
    const decision = resultadoDeLaDivision(total, renglones);
    const hayMontos = renglones.some((r) => r.montoTexto.trim() !== "");
    const cambiar = (i: number, cambio: Partial<RenglonDeDivision>) =>
      setVista({ tipo: "dividir", renglones: renglones.map((r, j) => (j === i ? { ...r, ...cambio } : r)) });
    const puedeAgregar = renglones.length < Math.min(MAX_PAGOS, MEDIOS_DE_COBRO.length);
    cuerpo = (
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2" aria-label="Medios del pago dividido">
          {renglones.map((r, i) => {
            const completa = leida.completado?.indice === i ? leida.completado.monto : null;
            return (
              <li key={i} className="flex flex-wrap items-end gap-2">
                <div role="group" aria-label={`Medio del pago ${i + 1}`} className="flex flex-wrap gap-1.5">
                  {mediosLibres(renglones, r.medio).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={CHIP}
                      aria-pressed={r.medio === m}
                      disabled={bloqueado}
                      onClick={() => cambiar(i, { medio: m })}
                    >
                      {etiquetaDeMedio(m)}
                    </button>
                  ))}
                </div>
                <label className="flex min-w-32 flex-1 flex-col gap-1 text-sm text-muted">
                  {r.medio ? `Con ${etiquetaDeMedio(r.medio)}` : "Elegí el medio"}
                  <input
                    className={CAMPO}
                    inputMode="decimal"
                    autoComplete="off"
                    value={r.montoTexto}
                    placeholder={completa !== null ? textoPlata(completa) : "$"}
                    disabled={bloqueado || r.medio === null}
                    onChange={(e) => cambiar(i, { montoTexto: e.target.value })}
                  />
                </label>
                {completa !== null && <span className="pb-3 text-xs text-muted">Se completa solo</span>}
                {renglones.length > 2 && (
                  <button
                    type="button"
                    className={CHIP}
                    disabled={bloqueado}
                    onClick={() => setVista({ tipo: "dividir", renglones: renglones.filter((_, j) => j !== i) })}
                  >
                    Quitar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          {puedeAgregar && (
            <button
              type="button"
              className={CHIP}
              disabled={bloqueado}
              onClick={() => setVista({ tipo: "dividir", renglones: [...renglones, { medio: null, montoTexto: "" }] })}
            >
              + Otro medio
            </button>
          )}
          <button type="button" className={cn(CHIP, "ml-auto")} disabled={enviando} onClick={() => ir({ tipo: "medios" })}>
            Volver
          </button>
        </div>
        <div aria-live="polite">
          {decision.ok && decision.vuelto > 0 && <CifraGrande rotulo="Vuelto" valor={decision.vuelto} />}
          {!decision.ok && hayMontos && (
            <p role="alert" className="text-sm font-medium text-danger">
              {decision.error}
            </p>
          )}
        </div>
        <button
          type="button"
          className={PRIMARIO}
          disabled={bloqueado || !decision.ok}
          onClick={() => decision.ok && cobrar(decision.resultado)}
        >
          {etiquetaCobrar}
        </button>
      </div>
    );
  } else {
    cuerpo = (
      <div className={cn("grid grid-cols-2 gap-2", permitirDividir ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
        <button
          type="button"
          className={TECLA}
          disabled={bloqueado}
          aria-label={`${etiquetaCobrar} en efectivo`}
          onClick={() => ir({ tipo: "efectivo", otro: null })}
        >
          <span>Efectivo</span>
          <span className="tabular-nums text-muted">{textoPlata(total)}</span>
        </button>
        {(["MERCADOPAGO", "TRANSFERENCIA"] as const satisfies readonly MedioDeCobro[]).map((m) => (
          <button
            key={m}
            type="button"
            className={TECLA}
            disabled={bloqueado}
            aria-label={`${etiquetaCobrar} con ${etiquetaDeMedio(m)}`}
            onClick={() => cobrar({ modo: "simple", medio: m })}
          >
            <span>{etiquetaDeMedio(m)}</span>
            <span className="tabular-nums text-muted">{textoPlata(total)}</span>
          </button>
        ))}
        {permitirDividir && (
          <button
            type="button"
            className={TECLA}
            disabled={bloqueado}
            onClick={() =>
              ir({
                tipo: "dividir",
                renglones: [
                  { medio: "EFECTIVO", montoTexto: "" },
                  { medio: null, montoTexto: "" },
                ],
              })
            }
          >
            Dividir
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-ui="pie-de-cobro"
      role="group"
      aria-label="Cobro"
      aria-busy={enviando || undefined}
      className="flex flex-col gap-3 bg-surface-sunken p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape" && vista.tipo !== "medios" && !enviando) ir({ tipo: "medios" });
      }}
    >
      {campos.map(([nombre, valor], i) => (
        <input key={`${nombre}-${i}`} type="hidden" name={nombre} value={valor} />
      ))}
      {motivo !== null && (
        <p role="status" className="text-sm font-medium text-muted">
          {motivo}
        </p>
      )}
      {cuerpo}
      {ultimoVuelto !== null && (vista.tipo === "medios" || (vista.tipo === "efectivo" && vista.otro === null)) && (
        <div aria-live="polite">
          <CifraGrande rotulo="Vuelto" valor={ultimoVuelto} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
