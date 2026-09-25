"use client";

// AVISO FLOTANTE con DESHACER — «Se anuló el cobro de $26.752 · Deshacer». Cada acción reversible
// avisa y ofrece volver atrás mientras dura la línea de tiempo de abajo (6 s por defecto). Se pausa
// con el puntero encima o el foco adentro (quien va a tocar «Deshacer» no pierde la carrera).
//
// Sólo presenta y cuenta el tiempo: qué hace «Deshacer» lo decide la pantalla (`onDeshacer`), y
// cuándo desaparece también (`onTermina`). El proveedor de avisos del panel
// (src/app/admin/(dashboard)/ToastProvider.tsx) es el que los apila; ver ADR-099.

import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { Icono } from "./Icono";

export type TonoAviso = "exito" | "error" | "info";

export type AvisoProps = {
  mensaje: React.ReactNode;
  tono?: TonoAviso;
  onDeshacer?: () => void;
  /** Palabra del botón (por defecto «Deshacer»). */
  textoDeshacer?: string;
  /** Milisegundos hasta `onTermina`. Con deshacer, 6 s; sin deshacer, 4 s. */
  duracion?: number;
  onTermina?: () => void;
  className?: string;
};

export function Aviso({ mensaje, tono = "exito", onDeshacer, textoDeshacer = "Deshacer", duracion, onTermina, className }: AvisoProps) {
  const total = duracion ?? (onDeshacer ? 6000 : 4000);
  const [pausado, setPausado] = useState(false);
  const restante = useRef(total);
  const inicio = useRef(0);
  const termina = useRef(onTermina);
  useEffect(() => {
    termina.current = onTermina;
  }, [onTermina]);

  useEffect(() => {
    if (pausado) return;
    inicio.current = Date.now();
    const t = setTimeout(() => termina.current?.(), restante.current);
    return () => {
      clearTimeout(t);
      restante.current = Math.max(0, restante.current - (Date.now() - inicio.current));
    };
  }, [pausado]);

  return (
    <div
      data-ui="aviso"
      data-tono={tono}
      role={tono === "error" ? "alert" : "status"}
      onPointerEnter={() => setPausado(true)}
      onPointerLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      className={cn(
        "pointer-events-auto relative flex w-full max-w-sm items-center gap-3 rounded-md bg-surface-inverted py-1.5 pl-4 pr-1.5 text-sm text-surface shadow-overlay",
        className,
      )}
    >
      <Icono nombre={tono === "error" ? "error" : tono === "info" ? "info" : "listo"} />
      <p className="min-w-0 flex-1 py-2">{mensaje}</p>
      {onDeshacer && (
        <button
          type="button"
          data-parte="deshacer"
          onClick={onDeshacer}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded px-3 font-semibold"
        >
          <Icono nombre="deshacer" className="size-4 shrink-0" />
          {textoDeshacer}
        </button>
      )}
      <span
        data-parte="tiempo"
        aria-hidden
        className="absolute inset-x-0 bottom-0 block"
        style={{ ["--duracion" as string]: `${total}ms`, animationPlayState: pausado ? "paused" : "running" }}
      />
    </div>
  );
}
