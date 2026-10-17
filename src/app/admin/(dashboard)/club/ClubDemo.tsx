"use client";

// ============================================================================
// EL CLUB EN MODO DEMO — agenda de canchas, buffet y caja, con datos de ejemplo.
// ============================================================================
//
// Arma el almacén UNA vez por visita (el motor del club, con la demo del día o lo que esta persona
// dejó en este equipo) y reparte la recepción en tres solapas:
//   · Agenda: la grilla de canchas y, al lado, lo que se abre: la cuenta de un turno o «Dar un turno».
//     En la tablet apaisada y en la PC van lado a lado (la agenda a la vista mientras se cobra); en el
//     celular, una debajo de la otra, y lo abierto se lleva el foco.
//   · Buffet: mesas que siguen cargando, cuentas abiertas, cargar productos, fiar con el OK del dueño.
//   · Caja: la caja de 12 a 12, egresos y cierre.
// Las solapas son estado del navegador (no enlaces): la demo no le pide nada al servidor.
// Todo aviso va a una sola barra, abajo, con «Deshacer» para la última acción.
//
// Nada va a la base: la cinta de arriba lo dice siempre. «Volver a la demo» tira lo tocado.
//
// Este archivo (y con él el motor) baja SÓLO en /admin/club: lo pide ClubCargador con
// `next/dynamic` y `ssr: false` (el motor guarda su contador de ids a nivel de módulo; en el
// servidor sería compartido entre pedidos).

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { hhmm } from "@/lib/club/motor.mjs";
import { claveDeLaDemo, crearAlmacen, type Guardado, type RolDelPanel } from "./almacen";
import AgendaCanchas from "./AgendaCanchas";
import AltaDeTurno from "./AltaDeTurno";
import BuffetDelClub from "./BuffetDelClub";
import CajaDelClub from "./CajaDelClub";
import CuentaDelTurno from "./CuentaDelTurno";
import { AvisosDelClub } from "./piezas";

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

type Solapa = "agenda" | "buffet" | "caja";
const SOLAPAS: readonly { id: Solapa; etiqueta: string }[] = [
  { id: "agenda", etiqueta: "Agenda" },
  { id: "buffet", etiqueta: "Buffet" },
  { id: "caja", etiqueta: "Caja" },
];

type Panel = { tipo: "cuenta"; id: string } | { tipo: "alta"; canchaId: string; inicio: number | null } | null;

export default function ClubDemo({ negocio, usuario, rol }: { negocio: string; usuario: string; rol: RolDelPanel }) {
  const [almacen] = useState(() => crearAlmacen({ hoy: hoyLocal(), clave: claveDeLaDemo(negocio, usuario), guardado: guardadoDelEquipo(), rol }));
  const [solapa, setSolapa] = useState<Solapa>("agenda");
  const [panel, setPanel] = useState<Panel>(null);
  const botones = useRef<Partial<Record<Solapa, HTMLButtonElement | null>>>({});

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

  const onAbrir = useCallback((id: string) => setPanel({ tipo: "cuenta", id }), []);
  const onReservar = useCallback((canchaId: string, inicio: number | null) => setPanel({ tipo: "alta", canchaId, inicio }), []);
  const abiertoId = panel?.tipo === "cuenta" ? panel.id : null;
  const onVolver = useCallback(() => {
    setPanel(null);
    // El foco vuelve al turno desde el que se abrió la cuenta.
    if (abiertoId) requestAnimationFrame(() => document.getElementById(`turno-${abiertoId}`)?.focus());
  }, [abiertoId]);
  const verTurno = useCallback((id: string) => {
    setSolapa("agenda");
    setPanel({ tipo: "cuenta", id });
  }, []);

  // Solapas con flechas (patrón de tablist): ←/→ cambian y llevan el foco.
  const alTeclearSolapa = (e: React.KeyboardEvent) => {
    const i = SOLAPAS.findIndex((s) => s.id === solapa);
    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const sig = SOLAPAS[(i + paso + SOLAPAS.length) % SOLAPAS.length].id;
    setSolapa(sig);
    botones.current[sig]?.focus();
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
        <Button
          variant="outline"
          size="md"
          onClick={() => {
            almacen.volverALaDemo();
            setPanel(null);
          }}
        >
          Volver a la demo
        </Button>
      </div>

      <div role="tablist" aria-label="Recepción del club" onKeyDown={alTeclearSolapa} className="flex overflow-x-auto border-b border-line">
        {SOLAPAS.map((s) => (
          <button
            key={s.id}
            ref={(b) => {
              botones.current[s.id] = b;
            }}
            type="button"
            role="tab"
            id={`club-solapa-${s.id}`}
            aria-selected={solapa === s.id}
            aria-controls={`club-panel-${s.id}`}
            tabIndex={solapa === s.id ? 0 : -1}
            onClick={() => setSolapa(s.id)}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm focus-visible:outline-2 focus-visible:outline-focus",
              solapa === s.id ? "border-accent font-semibold text-strong" : "border-transparent text-muted hover:text-strong",
            )}
          >
            {s.etiqueta}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`club-panel-${solapa}`} aria-labelledby={`club-solapa-${solapa}`}>
        {solapa === "agenda" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <AgendaCanchas almacen={almacen} abierto={abiertoId} onAbrir={onAbrir} onReservar={onReservar} />
            <div className="lg:sticky lg:top-4 lg:self-start">
              {panel?.tipo === "cuenta" ? (
                <CuentaDelTurno key={panel.id} almacen={almacen} reservaId={panel.id} onVolver={onVolver} />
              ) : panel?.tipo === "alta" ? (
                <AltaDeTurno
                  key={`${panel.canchaId}@${panel.inicio}`}
                  almacen={almacen}
                  canchaInicial={panel.canchaId}
                  inicioInicial={panel.inicio}
                  onListo={onAbrir}
                  onVolver={() => setPanel(null)}
                />
              ) : (
                <section aria-label="Cuenta del turno" className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">
                  Tocá un turno de la agenda para ver su cuenta: la cancha y los cargos de cada jugador, y cobrar. Tocá un hueco libre o «+ Turno» para dar un turno.
                </section>
              )}
            </div>
          </div>
        )}
        {solapa === "buffet" && <BuffetDelClub almacen={almacen} onVerTurno={verTurno} />}
        {solapa === "caja" && <CajaDelClub almacen={almacen} />}
      </div>

      <AvisosDelClub almacen={almacen} />
    </div>
  );
}
