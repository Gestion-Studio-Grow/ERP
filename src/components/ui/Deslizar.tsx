"use client";

// DESLIZAR PARA CONFIRMAR — lo irreversible (cerrar el día, cerrar el mes, anular un cobro) no se
// hace con un toque suelto: hay que llevar la perilla hasta el final. Soltada antes, vuelve con
// resorte. Con el teclado es un `slider`: flechas de a 10 %, Fin llega al final y confirma.
//
// Llegar al final llama `onConfirmar`; con `enviar`, además manda el <form> que la contiene
// (`requestSubmit`, así corren la validación y la server action de siempre). La lógica de cuándo
// confirma es pura y está probada en deslizar-core.test.ts.

import { useRef, useState } from "react";
import { cn } from "./cn";
import { Icono } from "./Icono";
import { alSoltar, avanceConTecla, avanceDe } from "./deslizar-core";
import { vibrar } from "./tactil";

export type DeslizarProps = {
  /** Lo que se lee en la pista: «Deslizá para cerrar el día». */
  texto: string;
  /** El nombre accesible de la perilla: «Cerrar el día». */
  etiqueta: string;
  /** Lo que queda escrito al confirmar: «Día cerrado». */
  textoHecho?: string;
  onConfirmar?: () => void;
  /** Manda el <form> que la contiene al confirmar. */
  enviar?: boolean;
  disabled?: boolean;
  className?: string;
};

type Estado = "quieto" | "arrastrando" | "hecho";

export function DeslizarParaConfirmar({ texto, etiqueta, textoHecho = "Listo", onConfirmar, enviar, disabled, className }: DeslizarProps) {
  const pista = useRef<HTMLDivElement>(null);
  const perilla = useRef<HTMLDivElement>(null);
  const x0 = useRef<number | null>(null);
  const [avance, setAvance] = useState(0);
  const [estado, setEstado] = useState<Estado>("quieto");

  const recorrido = () => {
    const p = pista.current;
    const k = perilla.current;
    return p && k ? p.clientWidth - k.offsetWidth - 8 : 0;
  };

  const confirmar = () => {
    setAvance(1);
    setEstado("hecho");
    vibrar(18);
    onConfirmar?.();
    if (enviar) pista.current?.closest("form")?.requestSubmit();
  };

  const bloqueado = disabled || estado === "hecho";

  return (
    <div
      ref={pista}
      data-ui="deslizar"
      data-estado={estado}
      aria-disabled={disabled || undefined}
      style={{ ["--avance" as string]: avance }}
      className={cn("relative flex h-15 items-center overflow-hidden rounded-full bg-surface-sunken p-1 select-none", className)}
    >
      <span data-parte="relleno" aria-hidden className="absolute inset-y-1 left-1 rounded-full bg-accent-soft" />
      <span
        data-parte={estado === "hecho" ? "hecho" : "texto"}
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 pl-14 pr-4 text-sm font-medium text-muted"
      >
        {estado === "hecho" ? (
          <>
            <Icono nombre="listo" />
            {textoHecho}
          </>
        ) : (
          texto
        )}
      </span>
      <div
        ref={perilla}
        data-parte="perilla"
        role="slider"
        tabIndex={bloqueado ? -1 : 0}
        aria-label={etiqueta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(avance * 100)}
        aria-valuetext={estado === "hecho" ? textoHecho : `${Math.round(avance * 100)} %: llevala hasta el final para confirmar`}
        aria-disabled={bloqueado || undefined}
        className="relative z-10 grid size-13 place-items-center rounded-full bg-accent text-on-accent"
        onPointerDown={(e) => {
          if (bloqueado) return;
          x0.current = e.clientX;
          setEstado("arrastrando");
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (x0.current === null) return;
          setAvance(avanceDe(e.clientX - x0.current, recorrido()));
        }}
        onPointerUp={() => {
          if (x0.current === null) return;
          x0.current = null;
          if (alSoltar(avance) === "confirma") confirmar();
          else {
            setEstado("quieto");
            setAvance(0);
          }
        }}
        onPointerCancel={() => {
          x0.current = null;
          setEstado("quieto");
          setAvance(0);
        }}
        onKeyDown={(e) => {
          if (bloqueado) return;
          const nuevo = avanceConTecla(avance, e.key);
          if (nuevo === null) return;
          e.preventDefault();
          if (nuevo >= 1) confirmar();
          else setAvance(nuevo);
        }}
      >
        <Icono nombre={estado === "hecho" ? "listo" : "flecha"} className="size-5" />
      </div>
    </div>
  );
}
