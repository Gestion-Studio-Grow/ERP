"use client";

// ============================================================================
// CIERRE DEL DÍA — contar primero (diseño nuevo «Renglón»).
// ============================================================================
//
// Quien cierra viene a CONTAR, no a leer cuatro bloques contables: la pantalla arranca por eso.
// Una hoja de arqueo, un renglón por medio: [medio] [contaste] [debería haber] [diferencia], la
// diferencia del día en grande (es lo que se le muestra a quien controla) y el cierre se CONFIRMA
// DESLIZANDO: es irreversible (congela el día) y un toque suelto no alcanza.
//
// Las reglas son las de siempre y viven en el servidor (`cerrarDia`) y en revisar-cierre.ts (la
// misma revisión que usa el formulario viejo): el efectivo es obligatorio aunque sea 0; con
// diferencia, la nota es obligatoria; lo tipeado se lee con `leerImporte` («12.500» son doce mil
// quinientos). Mismos campos a la acción que CerrarDiaForm: day, declarado_<MEDIO>, note.
//
// La deslizadora queda apagada mientras falte algo, y lo que falta está escrito al lado (no un
// botón gris mudo). Enter en un importe revisa y lleva el foco a lo que falta; con todo cargado, el
// foco va a la deslizadora (con el teclado: Fin la lleva hasta el final y confirma).

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cerrarDia, type CierreActionState } from "@/lib/cierre-diario-actions";
import type { CashMethod } from "@/lib/caja/cash-register";
import { leerImporte } from "@/lib/pos-peso";
import { DeslizarParaConfirmar } from "@/components/ui/Deslizar";
import { Button, Field, Plata, Rotulo } from "@/components/ui";
import { fmtMoneyARS } from "@/components/ui/format";
import { useToast } from "../../ToastProvider";
import { diferenciasDelCierre, revisarCierre, MEDIOS_DEL_CIERRE } from "./revisar-cierre";

export type MedioAContar = {
  medio: CashMethod;
  etiqueta: string;
  /** Qué hay que mirar para contarlo («el cajón», «la app de Mercado Pago»). */
  ayuda: string;
  esperado: number;
  /** ¿Hubo algo en este medio (saldo, ingresos o egresos)? Si no, no hay nada que contar. */
  seMovio: boolean;
};

function esRedirectDeNext(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

const ID_CAMPO = (m: CashMethod | "nota", uid: string) => `${uid}-${m}`;

export default function ContarYCerrar({
  day,
  diaLabel,
  diaNombre,
  medios,
}: {
  day: string;
  /** «24/09/2026», como lo dice el servidor en sus mensajes. */
  diaLabel: string;
  /** «jueves 24». */
  diaNombre: string;
  medios: MedioAContar[];
}) {
  const router = useRouter();
  const { showSuccess } = useToast();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [declarado, setDeclarado] = useState<Record<CashMethod, string>>({ EFECTIVO: "", MP: "", TARJETA: "" });
  const [nota, setNota] = useState("");
  const [mostrar, setMostrar] = useState<Set<CashMethod>>(() => new Set(medios.filter((m) => m.seMovio || m.medio === "EFECTIVO").map((m) => m.medio)));
  const [falta, setFalta] = useState<{ campo: CashMethod | "nota"; error: string } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [intento, setIntento] = useState(0);
  const [pending, startTransition] = useTransition();
  const deslizadora = useRef<HTMLDivElement>(null);

  const esperado = Object.fromEntries(MEDIOS_DEL_CIERRE.map((m) => [m, medios.find((x) => x.medio === m)?.esperado ?? 0])) as Record<CashMethod, number>;
  const etiquetas = Object.fromEntries(MEDIOS_DEL_CIERRE.map((m) => [m, medios.find((x) => x.medio === m)?.etiqueta ?? m])) as Record<CashMethod, string>;
  const diffs = diferenciasDelCierre(declarado, esperado);
  const revision = revisarCierre({ declarado, esperado, nota, etiquetas });
  const contados = MEDIOS_DEL_CIERRE.filter((m) => diffs[m] !== null);
  const diferencia = Math.round(contados.reduce((s, m) => s + (diffs[m] ?? 0), 0) * 100) / 100;
  const hayDiferencia = contados.some((m) => diffs[m] !== 0);
  const efectivo = leerImporte(declarado.EFECTIVO);
  const mpSeMovio = medios.find((m) => m.medio === "MP")?.seMovio ?? false;
  const sinMp = mpSeMovio && diffs.MP === null;

  // Enter revisa: si falta algo, el foco va ahí con el motivo; si no, a la deslizadora.
  function revisar() {
    if (!revision.listo) {
      setFalta({ campo: revision.campo, error: revision.error });
      if (revision.campo !== "nota") setMostrar((s) => new Set(s).add(revision.campo as CashMethod));
      setTimeout(() => document.getElementById(ID_CAMPO(revision.campo, uid))?.focus(), 0);
      return;
    }
    setFalta(null);
    deslizadora.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
  }

  function cerrar() {
    setErrores([]);
    const fd = new FormData();
    fd.set("day", day);
    for (const m of MEDIOS_DEL_CIERRE) fd.set(`declarado_${m}`, declarado[m]);
    fd.set("note", nota);
    startTransition(async () => {
      let r: CierreActionState;
      try {
        r = await cerrarDia(fd);
      } catch (e) {
        if (esRedirectDeNext(e)) throw e;
        r = {
          ok: false,
          errors: [
            "No se pudo confirmar el cierre: revisá la conexión y volvé a deslizar. Lo que contaste sigue cargado; si el día ya aparece cerrado, el cierre se hizo y no hay que repetirlo.",
          ],
        };
        router.refresh();
      }
      if (r?.ok) {
        showSuccess(r.message);
        router.refresh();
        return;
      }
      setErrores(r ? r.errors : ["No se pudo cerrar el día."]);
      setIntento((n) => n + 1); // la deslizadora vuelve a su lugar
    });
  }

  const cambio = (m: CashMethod, v: string) => {
    setDeclarado((d) => ({ ...d, [m]: v }));
    setFalta(null);
    setErrores([]);
  };

  return (
    <form
      noValidate
      aria-label={`Cerrar el día ${diaLabel}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) revisar();
      }}
      className="flex flex-col gap-5"
    >
      <section aria-labelledby={`${uid}-contar`}>
        <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-2">
          <h2 id={`${uid}-contar`} className="text-[15px] font-semibold text-strong">
            Contá la plata
          </h2>
          <span className="text-[13px] text-muted">Por cada medio, lo que hay de verdad</span>
        </div>
        <div className="hidden grid-cols-[minmax(0,1fr)_11rem_8rem_7.5rem] gap-x-4 border-b border-line py-1.5 sm:grid" aria-hidden>
          <Rotulo as="span">Medio</Rotulo>
          <Rotulo as="span">Contaste</Rotulo>
          <Rotulo as="span" className="text-right">
            Debería haber
          </Rotulo>
          <Rotulo as="span" className="text-right">
            Diferencia
          </Rotulo>
        </div>
        {medios.map((m) => {
          const d = diffs[m.medio];
          const error = falta?.campo === m.medio ? falta.error : null;
          const idCampo = ID_CAMPO(m.medio, uid);
          if (!mostrar.has(m.medio)) {
            return (
              <div key={m.medio} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line py-3 text-sm">
                <span>
                  <span className="font-medium text-strong">{m.etiqueta}</span>
                  <span className="text-muted"> · sin movimientos: no hay nada que contar</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setMostrar((s) => new Set(s).add(m.medio))}>
                  Contar igual
                </Button>
              </div>
            );
          }
          return (
            <div
              key={m.medio}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-3 sm:grid-cols-[minmax(0,1fr)_11rem_8rem_7.5rem]"
            >
              <label htmlFor={idCampo} className="min-w-0">
                <span className="block font-medium text-strong">{m.etiqueta}</span>
                <span className="block text-[13px] text-muted">{m.ayuda}</span>
              </label>
              {/* En el celular: el esperado arriba a la derecha, el campo abajo a todo el ancho. */}
              <span className="text-right sm:order-3">
                <Rotulo as="span" className="mr-1 sm:hidden">
                  Debería haber
                </Rotulo>
                <Plata valor={m.esperado} />
              </span>
              <span className="relative col-span-2 sm:order-2 sm:col-span-1">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
                  $
                </span>
                <input
                  id={idCampo}
                  data-ui="input"
                  data-importe
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="done"
                  // Vacío de verdad: ni el esperado (le soplaría la respuesta a quien cuenta) ni un «0»
                  // gris que parece un campo ya cargado.
                  value={declarado[m.medio]}
                  aria-invalid={error !== null || (declarado[m.medio].trim() !== "" && leerImporte(declarado[m.medio]).estado === "invalida")}
                  aria-describedby={error ? `${idCampo}-error` : undefined}
                  onChange={(e) => cambio(m.medio, e.target.value)}
                  style={{ paddingInlineStart: "1.75rem" }}
                  className="h-11 w-full rounded border border-line-strong bg-surface-raised pr-3 text-right text-lg"
                />
              </span>
              <span className="col-span-2 text-right text-sm sm:order-4 sm:col-span-1" aria-live="polite">
                {d === null ? (
                  <span className="text-muted">{m.medio === "EFECTIVO" ? "falta contar" : "sin contar"}</span>
                ) : d === 0 ? (
                  <span className="font-semibold text-success">Cuadra</span>
                ) : (
                  <span>
                    <span className="mr-1 text-muted">{d < 0 ? "faltan" : "sobran"}</span>
                    <Plata valor={Math.abs(d)} tono={d < 0 ? "peligro" : "cobrado"} />
                  </span>
                )}
              </span>
              {error && (
                <p id={`${idCampo}-error`} role="alert" className="col-span-2 text-sm text-danger sm:col-span-4">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section aria-label="Diferencia del día" className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line-strong pb-4 [container-type:inline-size]">
        <div className="min-w-0">
          <Rotulo>Diferencia del día</Rotulo>
          <p className="mt-1 text-sm text-body">
            {contados.length === 0
              ? "Todavía no contaste nada."
              : !hayDiferencia
                ? "Cuadra: lo que contaste es lo que el libro dice."
                : `${diferencia < 0 ? "Faltan" : "Sobran"} ${fmtMoneyARS(Math.abs(diferencia))}. Queda asentado en el libro como ajuste, con tu nombre.`}
          </p>
        </div>
        {contados.length > 0 && (
          <Plata valor={diferencia} tamano="grande" tono={diferencia < 0 ? "peligro" : diferencia > 0 ? "cobrado" : undefined} />
        )}
      </section>

      <Field
        label={hayDiferencia ? "Qué pasó (obligatorio con diferencia)" : "Qué pasó (opcional)"}
        htmlFor={ID_CAMPO("nota", uid)}
        error={falta?.campo === "nota" ? falta.error : undefined}
        hint={hayDiferencia ? "Vale «sin explicación por ahora»." : undefined}
      >
        <textarea
          id={ID_CAMPO("nota", uid)}
          data-ui="textarea"
          rows={2}
          value={nota}
          placeholder="cajón contado 20:10; MP de la app 20:15"
          aria-invalid={falta?.campo === "nota" || undefined}
          onChange={(e) => {
            setNota(e.target.value);
            setFalta(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              revisar();
            }
          }}
          className="w-full rounded border border-line-strong bg-surface-raised px-3 py-2 text-sm"
        />
      </Field>

      {sinMp && efectivo.estado === "ok" && (
        <p role="status" data-ui="franja" data-tono="atencion" className="text-sm">
          Estás cerrando sin mirar Mercado Pago, que es por donde pasa la mayor parte de la plata. Podés hacerlo, pero ese medio queda
          sin conciliar.
        </p>
      )}

      {errores.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-danger">
          {errores.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <div ref={deslizadora} className="flex flex-col gap-2">
        <DeslizarParaConfirmar
          key={intento}
          texto={revision.listo ? `Deslizá para cerrar el ${diaNombre}` : "Falta completar para cerrar"}
          etiqueta={`Cerrar el día ${diaLabel}`}
          textoHecho="Cerrando el día…"
          disabled={!revision.listo || pending}
          onConfirmar={cerrar}
        />
        <p className="text-sm text-muted">
          {!revision.listo
            ? revision.error
            : `Al cerrar, el ${diaNombre} queda congelado: no se rehace, y lo que aparezca después se carga con la fecha del día siguiente.${
                efectivo.estado === "ok" ? ` El día siguiente arranca con ${fmtMoneyARS(efectivo.valor)} de efectivo, lo que contaste.` : ""
              }`}
        </p>
      </div>
      <button type="submit" className="sr-only">
        Revisar lo contado
      </button>
    </form>
  );
}
