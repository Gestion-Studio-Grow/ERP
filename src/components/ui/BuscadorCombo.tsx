"use client";

// Buscador con lista desplegable: el reemplazo del <select> largo cuando hay decenas de
// opciones (cortes de MAGRA, clientas de CH). Se tipea, se filtra, Enter o toque elige.
//
// SIN imports de valor de Prisma ni de nada de servidor: es un client component y lo que
// importe viaja al navegador (ver la lección del build roto por `Prisma` en un cliente).
//
// Contrato: el padre guarda el id elegido; este componente sólo avisa con `onElegir`.
// `valor` es el id elegido hoy (o "" si ninguno), para mostrar su etiqueta.
//
// El teclado lo decide `decidirTecla` (buscador-teclado.ts, puro y probado con datos): el
// Enter se consume SIEMPRE —el combo vive dentro de formularios que cobran, y un Enter que se
// escapaba cobraba el ticket— y con el texto vacío no elige nada. Acá sólo se aplica.

import { useId, useMemo, useRef, useState } from "react";
import { cn } from "./cn";
import { filtrarOpciones, type OpcionBuscador } from "./buscador-filtro";
import { decidirTecla } from "./buscador-teclado";

export type { OpcionBuscador } from "./buscador-filtro";

export interface BuscadorComboProps {
  opciones: OpcionBuscador[];
  onElegir: (id: string) => void;
  placeholder?: string;
  valor?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
  /** Cuántas opciones se muestran a la vez. */
  max?: number;
}

const control =
  "w-full h-11 rounded-md border border-line-strong bg-surface-raised px-3 " +
  "text-sm text-strong placeholder:text-faint transition-colors focus:border-accent " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function BuscadorCombo({
  opciones,
  onElegir,
  placeholder = "Buscar…",
  valor = "",
  id,
  ariaLabel,
  className,
  max = 8,
}: BuscadorComboProps) {
  const autoId = useId();
  const inputId = id ?? `buscador-${autoId}`;
  const listaId = `${inputId}-lista`;
  const elegida = opciones.find((o) => o.id === valor);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  // Se movió con las flechas desde que se abrió o se tipeó: habilita elegir con Enter aunque
  // no haya texto (ver `decidirTecla`).
  const [recorrio, setRecorrio] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const visibles = useMemo(() => filtrarOpciones(opciones, texto, max), [opciones, texto, max]);

  function elegir(o: OpcionBuscador) {
    onElegir(o.id);
    setTexto("");
    setAbierto(false);
    setActivo(0);
    setRecorrio(false);
  }

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        className={control}
        placeholder={elegida ? elegida.etiqueta : placeholder}
        value={abierto ? texto : (elegida?.etiqueta ?? texto)}
        onFocus={() => {
          setAbierto(true);
          setTexto("");
          setActivo(0);
          setRecorrio(false);
        }}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
          setRecorrio(false);
        }}
        onKeyDown={(e) => {
          const d = decidirTecla(
            { key: e.key, componiendo: e.nativeEvent.isComposing },
            { abierto, texto, visibles, activo, recorrio },
          );
          if (d.prevenir) e.preventDefault();
          if (d.tipo === "mover") {
            setAbierto(true);
            setActivo(d.activo);
            setRecorrio(true);
          } else if (d.tipo === "elegir") {
            elegir(d.opcion);
          } else if (d.tipo === "cerrar") {
            setAbierto(false);
            inputRef.current?.blur();
          }
        }}
      />
      {abierto && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-line-strong bg-surface-raised py-1 shadow-lg"
        >
          {visibles.length === 0 ? (
            <li className="px-3 py-2 text-sm text-faint">Sin resultados para “{texto}”</li>
          ) : (
            visibles.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={i === activo}
                // onMouseDown y no onClick: el blur del input cerraría la lista antes del click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o);
                }}
                onMouseEnter={() => setActivo(i)}
                className={cn(
                  "flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5",
                  i === activo && "bg-surface-sunken",
                )}
              >
                <span className="text-sm text-strong">{o.etiqueta}</span>
                {o.detalle && <span className="text-xs text-faint">{o.detalle}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
