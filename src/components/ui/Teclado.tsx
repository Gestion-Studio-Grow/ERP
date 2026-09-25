"use client";

// TECLADO NUMÉRICO — la tecla de peso. Con guantes y la etiqueta de la balanza en la mano: se
// tipean SÓLO los dígitos de la etiqueta y la coma la pone el sistema («1280» → 1,280 kg), como un
// visor de balanza. En modo plata, pesos sin centavos («7» «00» «0» → $7.000). Lo que falta tipear
// se ve apagado en el visor. Teclas de 60 px en el celular; en la PC también anda con el teclado
// físico (dígitos, Retroceso, Supr/Escape limpia). Mantener apretado «borrar» limpia todo.
//
// Sólo presenta y junta dígitos: el valor sale por `onCambio` y, si hay `name`, por un <input
// hidden> del form. La cuenta del visor es pura y está probada en teclado-core.test.ts.

import { useRef, useState } from "react";
import { cn } from "./cn";
import { Icono } from "./Icono";
import { aplicarTecla, teclaDesdeTeclado, valorDe, visorDe, type ModoTeclado, type Tecla } from "./teclado-core";
import { vibrar } from "./tactil";

export type TecladoProps = {
  modo?: ModoTeclado;
  /** Qué se carga («Peso de la etiqueta», «Con cuánto paga»). */
  etiqueta: string;
  /** Una línea debajo del visor («Los dígitos de la etiqueta: la coma la ponemos nosotros»). */
  ayuda?: React.ReactNode;
  /** Dígitos de arranque (p. ej. "1280"). */
  inicial?: string;
  onCambio?: (valor: number, digitos: string) => void;
  /** Si va adentro de un form: el valor (kg o pesos) viaja con este nombre. */
  name?: string;
  className?: string;
};

const TECLAS: Tecla[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "borrar"];

export function TecladoNumerico({ modo = "peso", etiqueta, ayuda, inicial = "", onCambio, name, className }: TecladoProps) {
  const [digitos, setDigitos] = useState(inicial.replace(/\D/g, "").replace(/^0+/, ""));
  const apretado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visor = visorDe(digitos, modo);

  const tocar = (t: Tecla) => {
    const nuevo = aplicarTecla(digitos, t, modo);
    vibrar(8);
    if (nuevo === digitos) return;
    setDigitos(nuevo);
    onCambio?.(valorDe(nuevo, modo), nuevo);
  };

  return (
    <div
      data-ui="teclado"
      data-modo={modo}
      role="group"
      aria-label={etiqueta}
      className={cn("flex flex-col gap-3", className)}
      onKeyDown={(e) => {
        const t = teclaDesdeTeclado(e.key);
        if (!t) return;
        e.preventDefault();
        tocar(t);
      }}
    >
      <output data-parte="visor" aria-live="polite" className="block rounded-lg bg-surface-sunken px-4 py-3 text-right text-4xl font-semibold tabular-nums text-strong">
        <span className="sr-only">{visor.texto}</span>
        <span aria-hidden>
          <span data-parte="relleno">{visor.relleno}</span>
          {visor.cargado}
          {visor.unidad && <span data-parte="unidad"> {visor.unidad}</span>}
        </span>
      </output>
      {ayuda && (
        <p data-parte="ayuda" className="-mt-1 text-xs text-muted">
          {ayuda}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {TECLAS.map((t) => (
          <button
            key={t}
            type="button"
            data-ui="tecla"
            data-rol={t === "borrar" ? "borrar" : undefined}
            aria-label={t === "borrar" ? "Borrar el último dígito (mantener: borrar todo)" : undefined}
            className="grid h-14 place-items-center rounded-lg bg-surface-raised text-2xl font-semibold text-strong shadow-xs"
            onClick={() => tocar(t)}
            onPointerDown={() => {
              if (t !== "borrar") return;
              apretado.current = setTimeout(() => {
                apretado.current = null;
                tocar("limpiar");
              }, 550);
            }}
            onPointerUp={() => {
              if (apretado.current) clearTimeout(apretado.current);
            }}
            onPointerLeave={() => {
              if (apretado.current) clearTimeout(apretado.current);
            }}
          >
            {t === "borrar" ? <Icono nombre="borrar" /> : t}
          </button>
        ))}
      </div>
      {name && <input type="hidden" name={name} value={String(valorDe(digitos, modo))} />}
    </div>
  );
}
