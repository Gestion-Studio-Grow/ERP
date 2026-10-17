"use client";

// ============================================================================
// EL CLUB EN MODO DEMO — la agenda de canchas y la cuenta del turno, con datos de ejemplo.
// ============================================================================
//
// Arma el almacén UNA vez por visita (el motor del club, con la demo del día o lo que esta persona
// dejó en este equipo) y pone al lado la agenda y la cuenta del turno abierto. En la tablet
// apaisada y en la PC van lado a lado (la agenda a la vista mientras se cobra); en el celular, una
// debajo de la otra, y abrir un turno lleva el foco a su cuenta.
//
// Nada va a la base: la cinta de arriba lo dice siempre. «Volver a la demo» tira lo tocado.
//
// Este archivo (y con él el motor) baja SÓLO en /admin/club: lo pide ClubCargador con
// `next/dynamic` y `ssr: false` (el motor guarda su contador de ids a nivel de módulo; en el
// servidor sería compartido entre pedidos).

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { hhmm } from "@/lib/club/motor.mjs";
import { claveDeLaDemo, crearAlmacen, type Guardado } from "./almacen";
import AgendaCanchas from "./AgendaCanchas";
import CuentaDelTurno from "./CuentaDelTurno";

/** El día de hoy en este equipo, "AAAA-MM-DD" (la demo es del día). */
function hoyLocal(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** localStorage si el navegador lo deja (en incógnito o sin lugar puede tirar): si no, la demo vive en memoria. */
function guardadoDelEquipo(): Guardado | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function ClubDemo({ negocio, usuario }: { negocio: string; usuario: string }) {
  const [almacen] = useState(() => crearAlmacen({ hoy: hoyLocal(), clave: claveDeLaDemo(negocio, usuario), guardado: guardadoDelEquipo() }));
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  // Lo pendiente de guardar se escribe al salir de la página o al pasar a otra app.
  useEffect(() => {
    const guardar = () => almacen.guardarYa();
    const alOcultar = () => {
      if (document.visibilityState === "hidden") guardar();
    };
    window.addEventListener("pagehide", guardar);
    document.addEventListener("visibilitychange", alOcultar);
    return () => {
      window.removeEventListener("pagehide", guardar);
      document.removeEventListener("visibilitychange", alOcultar);
      guardar();
    };
  }, [almacen]);

  const onAbrir = useCallback((id: string) => setAbierto(id), []);
  const onVolver = useCallback(() => {
    const id = abierto;
    setAbierto(null);
    // El foco vuelve al turno desde el que se abrió la cuenta.
    if (id) requestAnimationFrame(() => document.getElementById(`turno-${id}`)?.focus());
  }, [abierto]);

  const volverALaDemo = () => {
    almacen.volverALaDemo();
    setAbierto(null);
    setAviso("Listo: volviste a la demo de hoy, como recién abierta.");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-strong">Datos de ejemplo — no se guarda nada en el sistema</p>
          <p className="text-body">
            Es la demo del club: lo que toques queda sólo en este equipo, para vos. Reloj de la demo: {hhmm(almacen.ahora().min)}.
            {almacen.retomada() ? " Seguís donde la dejaste." : ""}
          </p>
        </div>
        <Button variant="outline" size="md" onClick={volverALaDemo}>
          Volver a la demo
        </Button>
      </div>
      <p role="status" className="text-sm text-success">
        {aviso}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <AgendaCanchas almacen={almacen} abierto={abierto} onAbrir={onAbrir} />
        <div className="lg:sticky lg:top-4 lg:self-start">
          {abierto ? (
            <CuentaDelTurno key={abierto} almacen={almacen} reservaId={abierto} onVolver={onVolver} />
          ) : (
            <section aria-label="Cuenta del turno" className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">
              Tocá un turno de la agenda para ver su cuenta: la cancha y los cargos de cada jugador, y cobrar.
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
