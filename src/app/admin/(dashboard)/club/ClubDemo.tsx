"use client";

// ============================================================================
// EL CLUB EN MODO DEMO — agenda de canchas, buffet y caja, con datos de ejemplo.
// ============================================================================
//
// Arma el almacén UNA vez por visita (el motor del club, con la demo del día o lo que esta persona
// dejó en este equipo) y reparte la recepción en cinco solapas:
//   · Agenda: la grilla de canchas y, al lado, lo que se abre: la cuenta de un turno o «Dar un turno».
//     En la tablet apaisada y en la PC van lado a lado (la agenda a la vista mientras se cobra); en el
//     celular, una debajo de la otra, y lo abierto se lleva el foco.
//     Arriba, el día (hoy y la semana); abajo, lo cancelado, suspendido o la falta, con lo que haya que devolver.
//   · Fijos y espera: los turnos fijos semanales y la lista de espera con los huecos que le sirven.
//   · Mantenimiento y lluvia: plan lluvia con su previa, canchas en mantenimiento y bloqueos de horario.
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

import { Suspense, createElement, lazy, useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { hhmm, reserva as reservaDe } from "@/lib/club/motor.mjs";
import { claveDeLaDemo, crearAlmacen, type Guardado, type RolDelPanel } from "./almacen";
import AgendaCanchas from "./AgendaCanchas";
import AltaDeTurno from "./AltaDeTurno";
import { DiasDeLaAgenda, FueraDeLaGrilla } from "./AgendaExtras";
import CuentaDelTurno from "./CuentaDelTurno";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { AvisosDelClub } from "./piezas";
import { SOLAPAS_DEL_CLUB, type PropsDeSolapa } from "./solapas-club";

// PERFORMANCE (docs/producto/PERFORMANCE-TERMINALES.md, ronda 3): la Agenda (con la cuenta del turno y «Dar un
// turno») baja con la pantalla; las otras cuatro solapas, en chunks aparte que se piden en cuanto el navegador
// queda libre después de abrir (`precargarSolapas`), así el primer cambio de solapa no espera la red y la primera
// interacción (tocar un turno) no carga con su JS.
// Si ya llegó (lo normal: se precarga), se pinta directo; si no, `lazy` + Suspense muestra el esqueleto mientras baja.
// Sin esto, `lazy` muestra el esqueleto un cuadro aunque el módulo ya esté (tiene que resolver su promesa).
function diferida<P extends object>(cargar: () => Promise<{ default: ComponentType<P> }>) {
  let lista: ComponentType<P> | null = null;
  const precargar = () =>
    cargar().then((m) => {
      lista = m.default;
      return m;
    });
  const Perezosa = lazy(precargar);
  function Solapa(props: P) {
    return createElement(lista ?? Perezosa, props);
  }
  return { Solapa, precargar };
}
const fijos = diferida(() => import("./FijosYEspera"));
const canchas = diferida(() => import("./CanchasDelClub"));
const buffet = diferida(() => import("./BuffetDelClub"));
const caja = diferida(() => import("./CajaDelClub"));
const FijosYEspera = fijos.Solapa;
const CanchasDelClub = canchas.Solapa;
const BuffetDelClub = buffet.Solapa;
const CajaDelClub = caja.Solapa;
// Las solapas que suma la sesión del club (solapas-club.ts): mismo mecanismo, una por chunk.
const extras = SOLAPAS_DEL_CLUB.map((s) => ({ ...s, diferida: diferida<PropsDeSolapa>(s.cargar) }));
function precargarSolapas() {
  for (const d of [buffet, caja, fijos, canchas, ...extras.map((e) => e.diferida)]) void d.precargar().catch(() => undefined);
}
function SolapaCargando() {
  return (
    <div role="status" aria-label="Cargando la solapa" className="flex flex-col gap-3">
      <Esqueleto className="h-24 w-full rounded-lg" />
      <Esqueleto className="h-48 w-full rounded-lg" />
    </div>
  );
}

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

type Solapa = string;
const SOLAPAS_DE_FABRICA: readonly { id: Solapa; etiqueta: string }[] = [
  { id: "agenda", etiqueta: "Agenda" },
  { id: "fijos", etiqueta: "Fijos y espera" },
  { id: "canchas", etiqueta: "Mantenimiento y lluvia" },
  { id: "buffet", etiqueta: "Buffet" },
  { id: "caja", etiqueta: "Caja" },
];

type Panel = { tipo: "cuenta"; id: string } | { tipo: "alta"; canchaId: string; inicio: number | null } | null;

export default function ClubDemo({ negocio, usuario, rol }: { negocio: string; usuario: string; rol: RolDelPanel }) {
  const [almacen] = useState(() => crearAlmacen({ hoy: hoyLocal(), clave: claveDeLaDemo(negocio, usuario), guardado: guardadoDelEquipo(), rol }));
  const [solapa, setSolapa] = useState<Solapa>("agenda");
  const [SOLAPAS] = useState(() => [...SOLAPAS_DE_FABRICA, ...extras.filter((e) => !e.soloDuenos || rol === "OWNER")]);
  const [panel, setPanel] = useState<Panel>(null);
  const hoy = almacen.ahora().fecha;
  const [dia, setDia] = useState(hoy);
  const botones = useRef<Partial<Record<Solapa, HTMLButtonElement | null>>>({});

  // Las otras solapas se piden apenas el navegador queda libre (ya abierta la agenda).
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(precargarSolapas, { timeout: 2000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(precargarSolapas, 500);
    return () => clearTimeout(t);
  }, []);

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
    // Cerrar la cuenta deja lo hecho: ya no se deshace (como el aviso del club vanilla).
    almacen.olvidarDeshacer();
    setPanel(null);
    // El foco vuelve al turno desde el que se abrió la cuenta.
    if (abiertoId) requestAnimationFrame(() => document.getElementById(`turno-${abiertoId}`)?.focus());
  }, [abiertoId, almacen]);
  // Abrir la cuenta de un turno desde otra solapa (una mesa, la lista de espera): en el día de ese turno.
  const verTurno = useCallback(
    (id: string) => {
      const r = reservaDe(almacen.estado(), id);
      if (r) setDia(r.fecha);
      setSolapa("agenda");
      setPanel({ tipo: "cuenta", id });
    },
    [almacen],
  );
  const elegirDia = useCallback(
    (d: string) => {
      almacen.olvidarDeshacer();
      setDia(d);
      setPanel(null);
    },
    [almacen],
  );
  const cambiarSolapa = useCallback(
    (s: Solapa) => {
      // Cambiar de solapa también deja lo hecho.
      almacen.olvidarDeshacer();
      setSolapa(s);
    },
    [almacen],
  );

  // Solapas con flechas (patrón de tablist): ←/→ cambian y llevan el foco.
  const alTeclearSolapa = (e: React.KeyboardEvent) => {
    const i = SOLAPAS.findIndex((s) => s.id === solapa);
    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const sig = SOLAPAS[(i + paso + SOLAPAS.length) % SOLAPAS.length].id;
    cambiarSolapa(sig);
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
            // Sólo el panel de la solapa elegida está montado: las otras no apuntan a un id que no existe.
            aria-controls={solapa === s.id ? `club-panel-${s.id}` : undefined}
            tabIndex={solapa === s.id ? 0 : -1}
            onClick={() => cambiarSolapa(s.id)}
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
            <div className="flex min-w-0 flex-col gap-3">
              <DiasDeLaAgenda hoy={hoy} dia={dia} onDia={elegirDia} />
              <AgendaCanchas almacen={almacen} dia={dia} abierto={abiertoId} onAbrir={onAbrir} onReservar={onReservar} />
              <FueraDeLaGrilla almacen={almacen} dia={dia} />
            </div>
            <div className="lg:sticky lg:top-4 lg:self-start">
              {panel?.tipo === "cuenta" ? (
                <CuentaDelTurno key={panel.id} almacen={almacen} reservaId={panel.id} onVolver={onVolver} />
              ) : panel?.tipo === "alta" ? (
                <AltaDeTurno
                  key={`${dia}:${panel.canchaId}@${panel.inicio}`}
                  almacen={almacen}
                  fecha={dia}
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
        {solapa !== "agenda" && (
          <Suspense fallback={<SolapaCargando />}>
            {solapa === "fijos" && <FijosYEspera almacen={almacen} onVerTurno={verTurno} />}
            {solapa === "canchas" && <CanchasDelClub almacen={almacen} dia={dia} />}
            {solapa === "buffet" && <BuffetDelClub almacen={almacen} onVerTurno={verTurno} />}
            {solapa === "caja" && <CajaDelClub almacen={almacen} />}
            {extras.map((e) =>
              solapa === e.id && SOLAPAS.some((s) => s.id === e.id) ? (
                <e.diferida.Solapa key={e.id} almacen={almacen} dia={dia} rol={rol} onVerTurno={verTurno} />
              ) : null,
            )}
          </Suspense>
        )}
      </div>

      <AvisosDelClub almacen={almacen} />
    </div>
  );
}
