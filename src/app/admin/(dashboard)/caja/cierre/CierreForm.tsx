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

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cerrarDia, type CierreActionState } from "@/lib/cierre-diario-actions";
import { Card, CardHeader, CardTitle, CardDescription, Field, Input, Textarea, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { CASH_METHODS, CASH_METHOD_LABEL } from "@/lib/caja/libro-caja";
import type { CashMethod } from "@/lib/caja/cash-register";

type Esperado = Record<CashMethod, number>;

// Lo que la persona tiene que hacer con cada medio, dicho en su idioma.
const AYUDA: Record<CashMethod, string> = {
  EFECTIVO: "Contá el cajón. Obligatorio, aunque sea 0.",
  MP: "Mirá el saldo de la app. Es por donde entra y sale la mayor parte de la plata.",
  TARJETA: "Opcional: se liquida a los días. Dejalo vacío si no lo conciliás hoy.",
};

function parseInput(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function CerrarDiaForm({ day, esperado }: { day: string; esperado: Esperado }) {
  const router = useRouter();
  const [declarado, setDeclarado] = useState<Record<CashMethod, string>>({
    EFECTIVO: "",
    MP: "",
    TARJETA: "",
  });
  const [note, setNote] = useState("");
  const [state, setState] = useState<CierreActionState>(null);
  const [pending, startTransition] = useTransition();

  const diffs = useMemo(() => {
    const out = {} as Record<CashMethod, number | null>;
    for (const m of CASH_METHODS) {
      const d = parseInput(declarado[m]);
      out[m] = d === null ? null : Math.round((d - esperado[m]) * 100) / 100;
    }
    return out;
  }, [declarado, esperado]);

  const hayDiferencia = CASH_METHODS.some((m) => diffs[m] !== null && diffs[m] !== 0);
  const faltaNota = hayDiferencia && note.trim() === "";
  const faltaEfectivo = parseInput(declarado.EFECTIVO) === null;
  // MP mueve ~7 de cada 10 pesos del negocio: cerrar sin mirarlo es cerrar a medias.
  // Es un aviso, no un bloqueo — el sistema sirve a varios negocios y no todos lo usan.
  const sinMp = parseInput(declarado.MP) === null;

  function enviar() {
    setState(null);
    const fd = new FormData();
    fd.set("day", day);
    for (const m of CASH_METHODS) fd.set(`declarado_${m}`, declarado[m]);
    fd.set("note", note);
    startTransition(async () => {
      const r = await cerrarDia(fd);
      setState(r);
      if (r?.ok) router.refresh();
    });
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

      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-3">
        {CASH_METHODS.map((m) => {
          const d = diffs[m];
          return (
            <Field key={m} label={CASH_METHOD_LABEL[m]} htmlFor={`declarado-${m}`} hint={AYUDA[m]}>
              <Input
                id={`declarado-${m}`}
                name={`declarado_${m}`}
                type="number"
                step="0.01"
                min={0}
                inputMode="decimal"
                // NUNCA el esperado como placeholder: le sopla la respuesta a quien tiene
                // que contar, y en gris tenue parece un campo ya completado. El número
                // esperado ya está impreso abajo, a la vista, donde no sesga el conteo.
                placeholder="0"
                value={declarado[m]}
                onChange={(e) => setDeclarado((prev) => ({ ...prev, [m]: e.target.value }))}
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
            </Field>
          );
        })}
      </div>

      <div className="px-4 pb-4">
        <Field
          label="Qué pasó"
          htmlFor="cierre-note"
          hint={hayDiferencia ? "Obligatorio cuando hay diferencia. Vale “sin explicación por ahora”." : "Opcional."}
        >
          <Textarea
            id="cierre-note"
            name="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="cajón contado 20:10; MP app 20:15"
          />
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
      {state?.ok && (
        <p role="status" aria-live="polite" className="mx-4 mb-3 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <button
          type="button"
          onClick={enviar}
          disabled={pending || faltaEfectivo || faltaNota}
          className={buttonClasses("solid", "md")}
        >
          {pending ? "Cerrando…" : `Cerrar el día`}
        </button>
        <p className="text-xs text-muted">
          {faltaEfectivo
            ? "Falta el efectivo contado."
            : faltaNota
              ? "Hay diferencia: anotá qué pasó."
              : "Después de cerrar, el día queda congelado."}
        </p>
      </div>
    </Card>
  );
}
