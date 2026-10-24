"use client";

// Textos de WhatsApp (M-084): cada mensaje en su desplegable, con la vista previa EN VIVO armada
// con datos de ejemplo, chips para meter Nombre/Día/Hora/Precio/Alias/Link donde está el cursor y
// «Restaurar original». Se guarda solo al salir del campo (guardarCampoConfig «plantilla.<clave>»).

import { useRef, useState } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { useGuardarCampo } from "../_campo";
import { areaTexto, chipEleccion } from "../_estilos";
import { VARIABLES, insertarVariable, vistaPrevia } from "./ejemplo";

export type TextoEditable = { clave: string; rotulo: string; texto: string; original: string };

function UnTexto({ t, datos }: { t: TextoEditable; datos: Record<string, string> }) {
  const [texto, setTexto] = useState(t.texto);
  const [guardado, setGuardado] = useState(t.texto);
  const [listo, setListo] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { pendiente, error, guardar } = useGuardarCampo();
  const id = `texto-${t.clave}`;

  const guardarSi = (valor: string) => {
    if (valor.trim() === guardado.trim()) return;
    setListo(null);
    guardar(`plantilla.${t.clave}`, valor, (v) => {
      const s = String(v ?? "");
      setTexto(s);
      setGuardado(s);
      setListo("Guardado");
    });
  };

  const insertar = (clave: string) => {
    const el = ref.current;
    const r = insertarVariable(texto, clave, el?.selectionStart ?? null, el?.selectionEnd ?? null);
    setTexto(r.texto);
    setListo(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.cursor, r.cursor);
    });
  };

  return (
    <details className="rounded-2xl border border-line bg-surface-raised" data-qa={`texto-${t.clave}`}>
      <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-2 px-4 py-2 text-base font-semibold text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <span>{t.rotulo}</span>
        {texto !== t.original && <span className="shrink-0 text-xs font-medium text-muted">cambiado</span>}
      </summary>
      <div className="grid gap-3 px-4 pb-4">
        <label htmlFor={id} className="sr-only">{t.rotulo}</label>
        <textarea
          ref={ref}
          id={id}
          value={texto}
          maxLength={600}
          rows={4}
          onChange={(e) => {
            setTexto(e.target.value);
            setListo(null);
          }}
          onBlur={(e) => {
            // Tocar un chip de variable o «Restaurar original» no cuenta como salir del campo.
            if ((e.relatedTarget as HTMLElement | null)?.dataset?.sinGuardar) return;
            guardarSi(texto);
          }}
          aria-describedby={`${id}-previa ${id}-estado`}
          aria-invalid={Boolean(error) || undefined}
          className={areaTexto}
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Insertar un dato en el texto">
          {VARIABLES.map((v) => (
            <button key={v.clave} type="button" data-sin-guardar="1" onClick={() => insertar(v.clave)} className={cn(chipEleccion, "px-3")}>
              + {v.rotulo}
            </button>
          ))}
        </div>
        <div id={`${id}-previa`} className="rounded-xl bg-surface-sunken p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Así le llega (ejemplo)</p>
          <p className="whitespace-pre-line text-sm text-strong" aria-live="polite" data-qa={`previa-${t.clave}`}>
            {vistaPrevia(texto, datos) || "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id={`${id}-estado`} role={error ? "alert" : "status"} className={cn("min-h-5 text-sm", error ? "font-semibold text-danger" : "text-success")}>
            {error ?? (pendiente ? <span className="text-muted">Guardando…</span> : listo ? `✓ ${listo}` : "")}
          </p>
          {texto !== t.original && (
            <button
              type="button"
              disabled={pendiente}
              data-sin-guardar="1"
              onClick={() => {
                setListo(null);
                // Si lo guardado ya es el original, sólo se descarta lo escrito.
                if (guardado === t.original) return setTexto(t.original);
                guardar(`plantilla.${t.clave}`, "", (v) => {
                  const s = String(v ?? t.original);
                  setTexto(s);
                  setGuardado(s);
                  setListo("Volvió el texto original");
                });
              }}
              className={cn(buttonClasses("outline", "lg"), "h-12")}
              data-qa={`restaurar-${t.clave}`}
            >
              Restaurar original
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

export function EditorTextos({ textos, datos }: { textos: TextoEditable[]; datos: Record<string, string> }) {
  return (
    <ul className="grid gap-2">
      {textos.map((t) => (
        <li key={t.clave}>
          <UnTexto t={t} datos={datos} />
        </li>
      ))}
    </ul>
  );
}
