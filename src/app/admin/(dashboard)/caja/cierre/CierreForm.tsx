"use client";

// Formulario del CIERRE DE CAJA. Una sola escritura, al final.
//
// ⚠️ Igual que LibroForms.tsx, NO usa `useActionState`: por ese camino el QA midió
// guardados que quedaban colgados en "Guardando…" con la fila ya escrita. Acá la acción
// se invoca directo y se espera su promesa.
//
// La diferencia se calcula EN EL CLIENTE mientras se tipea (resta contra el esperado que
// ya vino renderizado), sin ida y vuelta al servidor. Es sólo una vista previa: el
// servidor recalcula todo contra la base antes de escribir y nunca confía en esto.
//
// EN DOS PASOS Y CON EL TECLADO (revisar-cierre.ts): Enter en un importe revisa; lo que falta
// se dice en su campo y el foco va ahí; con todo cargado aparece la confirmación —cerrar es
// irreversible— con el foco en «Sí, cerrar el día», y Escape vuelve a revisar. Tocar cualquier
// importe o la nota con la confirmación abierta la cancela: se confirma lo que está escrito.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cerrarDia, type CierreActionState } from "@/lib/cierre-diario-actions";
import { Card, CardHeader, CardTitle, CardDescription, Field, Input, Textarea, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { CASH_METHODS, CASH_METHOD_LABEL } from "@/lib/caja/libro-caja";
import type { CashMethod } from "@/lib/caja/cash-register";
import { leerImporte } from "@/lib/pos-peso";
import { useToast } from "../../ToastProvider";
import { diferenciasDelCierre, revisarCierre, type CampoDelCierre } from "./revisar-cierre";

type Esperado = Record<CashMethod, number>;

// Lo que la persona tiene que hacer con cada medio, dicho en su idioma.
const AYUDA: Record<CashMethod, string> = {
  EFECTIVO: "Contá el cajón. Obligatorio, aunque sea 0.",
  MP: "Mirá el saldo de la app. Es por donde entra y sale la mayor parte de la plata.",
  TARJETA: "Opcional: se liquida a los días. Dejalo vacío si no lo conciliás hoy.",
};

// Mismo lector que el servidor: "12.500" son doce mil quinientos. El campo es de TEXTO a
// propósito: un `type="number"` de Chromium tira la coma al tipear ("12,5" → 125) y lee
// "12.500" como 12,5 (medido, Chromium 141, teclado físico y virtual).
function parseInput(raw: string): number | null {
  const l = leerImporte(raw);
  return l.estado === "ok" ? l.valor : null;
}

// El redirect de sesión vencida llega como excepción con digest NEXT_REDIRECT: se deja pasar.
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

const idDelCampo = (c: CampoDelCierre) => (c === "nota" ? "cierre-note" : `declarado-${c}`);

export function CerrarDiaForm({ day, diaLabel, esperado }: { day: string; diaLabel: string; esperado: Esperado }) {
  const router = useRouter();
  const { showSuccess } = useToast();
  const [declarado, setDeclarado] = useState<Record<CashMethod, string>>({
    EFECTIVO: "",
    MP: "",
    TARJETA: "",
  });
  const [note, setNote] = useState("");
  const [state, setState] = useState<CierreActionState>(null);
  const [pending, startTransition] = useTransition();
  // El motivo por el que todavía no se puede cerrar, en el campo que falta.
  const [falta, setFalta] = useState<{ campo: CampoDelCierre; error: string } | null>(null);
  // La confirmación: lo que se va a asentar, medio por medio. null = todavía revisando.
  const [confirmando, setConfirmando] = useState<string[] | null>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  // Al volver de la confirmación (o de un intento que falló), el foco vuelve al botón que la
  // abrió: no se pierde en la página. Se espera a que el envío termine, porque mientras tanto
  // el botón está deshabilitado y un botón deshabilitado no toma el foco.
  const focoAlBoton = useRef(false);
  const [volverFoco, setVolverFoco] = useState(0);
  useEffect(() => {
    if (!focoAlBoton.current || pending || !cerrarRef.current) return;
    focoAlBoton.current = false;
    cerrarRef.current.focus();
  }, [volverFoco, pending]);
  function pedirFocoAlBoton() {
    focoAlBoton.current = true;
    setVolverFoco((n) => n + 1);
  }

  const diffs = useMemo(() => diferenciasDelCierre(declarado, esperado), [declarado, esperado]);
  const hayDiferencia = CASH_METHODS.some((m) => diffs[m] !== null && diffs[m] !== 0);
  const faltaEfectivo = parseInput(declarado.EFECTIVO) === null;
  // MP mueve ~7 de cada 10 pesos del negocio: cerrar sin mirarlo es cerrar a medias.
  // Es un aviso, no un bloqueo — el sistema sirve a varios negocios y no todos lo usan.
  const sinMp = parseInput(declarado.MP) === null;

  function revisar() {
    setState(null);
    const r = revisarCierre({ declarado, esperado, nota: note, etiquetas: CASH_METHOD_LABEL });
    if (!r.listo) {
      setFalta({ campo: r.campo, error: r.error });
      document.getElementById(idDelCampo(r.campo))?.focus();
      return;
    }
    setFalta(null);
    setConfirmando(r.renglones);
  }

  function volverARevisar() {
    setConfirmando(null);
    pedirFocoAlBoton();
  }

  function enviar() {
    setState(null);
    const fd = new FormData();
    fd.set("day", day);
    for (const m of CASH_METHODS) fd.set(`declarado_${m}`, declarado[m]);
    fd.set("note", note);
    startTransition(async () => {
      let r: CierreActionState;
      try {
        r = await cerrarDia(fd);
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        // No se sabe si llegó: lo contado queda escrito, y la pantalla se vuelve a leer para
        // mostrar el comprobante si el cierre sí se hizo.
        r = {
          ok: false,
          errors: [
            "No se pudo confirmar el cierre: revisá la conexión y volvé a tocar «Cerrar el día». Lo que contaste sigue " +
              "cargado; si el día ya aparece cerrado, el cierre se hizo y no hay que repetirlo.",
          ],
        };
        router.refresh();
      }
      setState(r);
      setConfirmando(null);
      if (r?.ok) {
        // El formulario se va con el refresco (el día pasa a cerrado y se ve el comprobante):
        // el aviso que sobrevive es el del layout.
        showSuccess(r.message);
        router.refresh();
      } else {
        pedirFocoAlBoton();
      }
    });
  }

  // Tocar un importe o la nota con la confirmación abierta la cancela.
  function cambio() {
    if (confirmando) setConfirmando(null);
    if (falta) setFalta(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lo que contaste</CardTitle>
        <CardDescription>
          Escribí lo que hay de verdad. Si no coincide con el libro, la diferencia se
          asienta como una fila más — que es exactamente lo que la planilla nunca hacía.
        </CardDescription>
      </CardHeader>

      <form
        noValidate
        aria-label="Cerrar el día"
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirmando && !pending) revisar();
        }}
      >
        <div className="grid gap-4 px-4 pb-4 sm:grid-cols-3">
          {CASH_METHODS.map((m) => {
            const d = diffs[m];
            const errorAca = falta && falta.campo === m ? falta.error : null;
            return (
              <Field key={m} label={CASH_METHOD_LABEL[m]} htmlFor={`declarado-${m}`} hint={AYUDA[m]}>
                <Input
                  id={`declarado-${m}`}
                  name={`declarado_${m}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="done"
                  aria-invalid={errorAca !== null || (declarado[m].trim() !== "" && parseInput(declarado[m]) === null)}
                  aria-describedby={errorAca ? `declarado-${m}-error` : undefined}
                  // NUNCA el esperado como placeholder: le sopla la respuesta a quien tiene
                  // que contar, y en gris tenue parece un campo ya completado. El número
                  // esperado ya está impreso abajo, a la vista, donde no sesga el conteo.
                  placeholder="0"
                  value={declarado[m]}
                  onChange={(e) => {
                    setDeclarado((prev) => ({ ...prev, [m]: e.target.value }));
                    cambio();
                  }}
                />
                <p className="mt-1 text-xs tabular-nums text-muted">
                  El libro dice {fmtMoneyARS(esperado[m])}
                  {d !== null && d !== 0 && (
                    <span className={d > 0 ? "ml-2 font-medium text-success" : "ml-2 font-medium text-danger"}>
                      · {d > 0 ? "sobran" : "faltan"} {fmtMoneyARS(Math.abs(d))}
                    </span>
                  )}
                  {d === 0 && <span className="ml-2 font-medium text-success">· cuadra</span>}
                </p>
                {errorAca && (
                  <p id={`declarado-${m}-error`} role="alert" className="mt-1 text-xs text-danger">
                    {errorAca}
                  </p>
                )}
              </Field>
            );
          })}
        </div>

        <div className="px-4 pb-4">
          <Field
            label="Qué pasó"
            htmlFor="cierre-note"
            hint={
              hayDiferencia
                ? "Obligatorio cuando hay diferencia. Vale “sin explicación por ahora”. Ctrl + Enter para seguir."
                : "Opcional."
            }
          >
            <Textarea
              id="cierre-note"
              name="note"
              rows={2}
              value={note}
              aria-invalid={falta?.campo === "nota" || undefined}
              aria-describedby={falta?.campo === "nota" ? "cierre-note-error" : undefined}
              onChange={(e) => {
                setNote(e.target.value);
                cambio();
              }}
              // En la nota, Enter es un renglón nuevo; Ctrl/⌘ + Enter sigue al cierre.
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="cajón contado 20:10; MP app 20:15"
            />
            {falta?.campo === "nota" && (
              <p id="cierre-note-error" role="alert" className="mt-1 text-xs text-danger">
                {falta.error}
              </p>
            )}
          </Field>
        </div>

        {sinMp && !faltaEfectivo && (
          <p className="mx-4 mb-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
            Estás cerrando sin mirar MP, que es por donde pasa la mayor parte de la plata.
            Podés hacerlo, pero ese medio queda sin conciliar.
          </p>
        )}

        {state && !state.ok && (
          <ul role="alert" className="mx-4 mb-3 space-y-1 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}

        {confirmando ? (
          // La confirmación: lo que se va a asentar y el botón que lo hace. Escape vuelve.
          <div
            role="group"
            aria-labelledby="cierre-confirmar-titulo"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                volverARevisar();
              }
            }}
            className="space-y-3 border-t border-line px-4 py-3"
          >
            <p id="cierre-confirmar-titulo" className="text-sm font-medium text-strong">
              ¿Cerrar el día {diaLabel}?
            </p>
            <ul className="space-y-0.5 text-sm tabular-nums text-body">
              {confirmando.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              Después de cerrar, el día queda congelado: no se rehace. Lo que aparezca después se carga con la fecha
              del día siguiente.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" autoFocus onClick={enviar} disabled={pending} className={buttonClasses("solid", "md")}>
                {pending ? "Cerrando…" : "Sí, cerrar el día"}
              </button>
              <button type="button" onClick={volverARevisar} disabled={pending} className={buttonClasses("ghost", "md")}>
                Volver a revisar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
            {/* Habilitado siempre: si falta algo, al tocarlo (o con Enter) se dice qué y el
                foco va al campo. Un botón deshabilitado no explica nada y con el teclado ni se
                llega a él. */}
            <button ref={cerrarRef} type="submit" disabled={pending} className={buttonClasses("solid", "md")}>
              Cerrar el día
            </button>
            <p className="text-xs text-muted">
              {faltaEfectivo
                ? "Falta el efectivo contado."
                : hayDiferencia && note.trim() === ""
                  ? "Hay diferencia: anotá qué pasó."
                  : "Antes de cerrar vas a ver el resumen para confirmar."}
            </p>
          </div>
        )}
      </form>
    </Card>
  );
}
