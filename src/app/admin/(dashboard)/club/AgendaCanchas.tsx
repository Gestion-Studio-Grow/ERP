"use client";

// ============================================================================
// LA AGENDA DE CANCHAS — canchas × franjas del día; tocar un turno abre su cuenta.
// ============================================================================
//
// Mismo lenguaje que «Por profesional» de la agenda de CH (turnos/_agenda/PorProfesional.tsx): la
// hora fija a la izquierda, una columna por cancha y cada turno como un tramo con la hora, el
// titular y su marca de estado (forma + palabra, nunca sólo color). Lo que cambia es el dato: la
// cancha en vez del profesional y la señal de plata del club.
//
// Teclado: cada turno es un botón (Tab los recorre cancha por cancha, de arriba abajo) y las flechas
// van al de arriba/abajo en la misma cancha o al de la cancha de al lado (`vecino`, agenda-core.ts).
// Cada cancha es una lista con su nombre, para el lector de pantalla.
//
// Performance: la grilla se toca cientos de veces por día. Nada se anima. El fondo de franjas es un
// gradiente por columna (no una celda por franja), cada tramo es un `memo` que recibe la MISMA celda
// si no cambió (`compartirAgenda`), y la agenda entera no se repinta si la grilla quedó igual.
//
// La luz de cada cancha (arriba, en su encabezado) es un botón con su PROPIA suscripción al almacén
// (`LuzDeCancha`): prender o apagar repinta sólo ese botón. La grilla no lee las luces, así que su firma no
// cambia y ni la agenda ni los turnos se vuelven a pintar.
//
// El BOTÓN DEL MOMENTO (bp-DISENO §2.2, `botonesDelMomento` de agenda-core.ts) va abajo del bloque, fuera del botón del
// turno (no se anidan botones): abrir, cobrar la seña y abrir, +30 min, cobrar, cerrar, la mesa sigue, no vino. Lo que
// necesita un medio despliega los 4 en un menú chico (`MenuDelMomento`), como «Cobrar la seña y abrir» del clic derecho.
// Si a la hora de abrir la cancha sigue ocupada por el anterior, «Cerrar y abrir»: el menú pide la seña del que llega (si
// falta), cómo paga lo suyo el que se va (o a su cuenta corriente) y si su mesa sigue; sale como UN comando «cierre».
// Todo sale como COMANDO de la lista blanca (re-aplicable en otro puesto). Arriba, junto a «+ Turno»: «Buscar lugar» y
// «Compartir lo libre» (AgendaExtras.tsx).
//
// La piel de Break Point (piel/agenda.css, bajo `[data-estetica="breakpoint"]`) la deja densa como el club de hoy:
// franjas de 30 px por media hora, la lamparita y los botones de 32 px a la vista (el área de toque sigue en 44). Por
// eso la geometría (la raya de ahora, el arrastre, dónde arranca la grilla) NO supone un alto: lo lee de la grilla
// pintada (`medidasDeLaGrilla`).

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./piel/agenda.css";
import { Marca } from "@/components/ui/Marca";
import { cn } from "@/components/ui/cn";
import { armarAgenda, compartirAgenda, opcionesDelMenu, previaArrastre, velocidadAlBorde, vecino, type BotonDelMomento, type CeldaTurno, type Direccion, type FranjaLibre, type OpcionDelMenu, type PreviaArrastre, type VistaAgenda } from "./agenda-core";
import { BuscarLugar, CompartirLoLibre } from "./AgendaExtras";
import { DESHACIBLE, ETIQUETA_MEDIO, MEDIOS_CAJA, type MedioCaja } from "./cuenta-core";
import { pesos } from "@/lib/club/motor.mjs";
import { Button } from "@/components/ui/Button";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { useSeleccion } from "./usar-almacen";

/**
 * Alto de una franja de la grilla: por defecto 44 px, el piso táctil de la tablet de recepción (también el de un hueco
 * libre). Una piel lo cambia con `--agenda-fila` (Break Point: 30 px, como el club de hoy).
 */
const FILA_REM = 2.75;
const FILA = `var(--agenda-fila, ${FILA_REM}rem)`;

/**
 * Las medidas de la grilla TAL COMO SE PINTÓ (px): la cabecera de las canchas, una franja y la columna de las horas.
 * Salen de las pistas resueltas de la grilla CSS, así la raya de ahora, el arrastre y el arranque usan el mismo alto que
 * ve la persona, sea cual sea la piel.
 */
function medidasDeLaGrilla(g: HTMLElement): { cabecera: number; fila: number; horas: number } {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const cs = getComputedStyle(g);
  const filas = cs.gridTemplateRows.split(" ").map(parseFloat);
  const columnas = cs.gridTemplateColumns.split(" ").map(parseFloat);
  return { cabecera: filas[0] || 3 * rem, fila: filas[1] || FILA_REM * rem, horas: columnas[0] || 3.5 * rem };
}

/**
 * «Mover…» y «Marcar falta…» del menú rápido abren la cuenta del turno con ESE formulario ya desplegado: el mismo de su
 * pie (CicloDelTurno), con sus reglas y su previa. Se reconoce por el texto de su botón (ETIQUETAS de CicloDelTurno).
 */
const EN_LA_CUENTA = { mover: "Mover", falta: "No vino" } as const;

function desplegarEnLaCuenta(cual: keyof typeof EN_LA_CUENTA, intentos = 30) {
  const boton = [...document.querySelectorAll<HTMLButtonElement>('[data-ui="hoja-del-turno"] [data-cuenta="pie"] button[aria-expanded]')].find((b) => b.textContent?.trim() === EN_LA_CUENTA[cual]);
  // La hoja se monta en el cuadro que sigue a elegir: se la espera un poco (medio segundo como mucho).
  if (!boton) {
    if (intentos > 0) requestAnimationFrame(() => desplegarEnLaCuenta(cual, intentos - 1));
    return;
  }
  if (boton.getAttribute("aria-expanded") !== "true") boton.click();
  requestAnimationFrame(() => {
    // El foco va al primer campo del formulario (la cancha a donde mover, a quién se le cobra la falta).
    const campo = boton.closest('[data-cuenta="pie"]')?.querySelector<HTMLElement>(":scope > div:last-child :is(select, input)");
    campo?.focus();
    campo?.scrollIntoView({ block: "nearest" });
  });
}

const FLECHAS: Record<string, Direccion> = { ArrowUp: "arriba", ArrowDown: "abajo", ArrowLeft: "izquierda", ArrowRight: "derecha" };

const compartir = (previa: VistaAgenda | undefined, nueva: VistaAgenda) => compartirAgenda(previa ?? null, nueva);

/**
 * Cómo se ve cada estado: fondo y borde por token (la marca dice el estado en palabras). Sobre el fondo hundido
 * (`surface-sunken`) el texto va en `text-body`: `text-muted` ahí da 4,33:1, debajo del 4,5:1 de AA
 * (medido en docs/producto/PERFORMANCE-TERMINALES.md, ronda 3).
 */
const TONO: Record<CeldaTurno["estado"], string> = {
  reservada: "bg-surface-raised border-line-strong",
  en_cancha: "bg-success-soft border-success/50",
  finalizada: "bg-surface-sunken border-line text-body",
  cancelada: "bg-surface-sunken border-line",
  no_show: "bg-surface-sunken border-line",
  suspendida: "bg-surface-sunken border-line",
};

/** Mantener apretado en la tablet abre el menú rápido (como el club de hoy); el toque que lo abrió no abre la cuenta. */
const MANTENER_MS = 550;

const BloqueTurno = memo(function BloqueTurno({
  celda,
  activo,
  onAbrir,
  onMenu,
  onArrastrar,
  onTecla,
  onMomento,
}: {
  celda: CeldaTurno;
  activo: boolean;
  /** El botón del momento: la acción y dónde se tocó (para desplegar los medios ahí). */
  onMomento: (id: string, boton: BotonDelMomento, x: number, y: number) => void;
  onAbrir: (id: string) => void;
  onMenu: (id: string, x: number, y: number) => void;
  /** Mover (arrastrando el turno, o su manija en la tablet) o estirar (la manija de abajo). */
  onArrastrar: (id: string, modo: "mover" | "estirar", e: React.PointerEvent) => void;
  /** Alt + flechas mueven; Alt + Shift + ↓ estira media hora. */
  onTecla: (id: string, e: React.KeyboardEvent) => void;
}) {
  const movible = celda.estado === "reservada" || celda.estado === "en_cancha";
  // El botón del momento necesita lugar: en un turno de media hora (una franja) queda en el clic derecho.
  const momento = celda.alto >= 2 ? celda.momento : [];
  const fijo = celda.tipo === "Turno fijo";
  const largo = useRef<{ timer: ReturnType<typeof setTimeout> | null; abrio: boolean }>({ timer: null, abrio: false });
  const soltar = () => {
    if (largo.current.timer) clearTimeout(largo.current.timer);
    largo.current.timer = null;
  };
  return (
    <li className="relative z-[1] m-0.5 flex min-w-0" style={{ gridColumn: celda.columna + 2, gridRow: `${celda.fila + 2} / span ${celda.alto}` }}>
      <button
        type="button"
        id={`turno-${celda.id}`}
        data-celda={celda.id}
        data-turno={celda.estado}
        data-turno-tipo={fijo ? "fijo" : undefined}
        data-con-momento={momento.length ? "" : undefined}
        onClick={() => {
          if (largo.current.abrio) {
            largo.current.abrio = false;
            return;
          }
          onAbrir(celda.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          soltar();
          // Desde el teclado (tecla de menú) no hay puntero: se abre arriba del turno.
          const r = e.currentTarget.getBoundingClientRect();
          const teclado = e.clientX === 0 && e.clientY === 0;
          onMenu(celda.id, teclado ? r.left + 8 : e.clientX, teclado ? r.top + 24 : e.clientY);
        }}
        onKeyDown={(e) => onTecla(celda.id, e)}
        onPointerDown={(e) => {
          largo.current.abrio = false;
          if (movible && e.pointerType === "mouse" && e.button === 0) onArrastrar(celda.id, "mover", e);
          if (e.pointerType !== "touch") return;
          const { clientX: x, clientY: y } = e;
          largo.current.timer = setTimeout(() => {
            largo.current.abrio = true;
            onMenu(celda.id, x, y);
          }, MANTENER_MS);
        }}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        onPointerCancel={soltar}
        aria-label={`${celda.etiqueta}. Abrir la cuenta del turno (clic derecho: acciones rápidas${movible ? "; Alt y flechas: moverlo; Alt, Mayúscula y flecha abajo: alargarlo" : ""})`}
        aria-current={activo ? "true" : undefined}
        className={cn(
          "flex min-h-11 w-full min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded-md border px-2 py-1 text-left",
          momento.length > 0 && "pb-12",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
          TONO[celda.estado],
          fijo && "border-l-4 border-l-warning",
          // «Necesita atención» (una alerta urgente de la bandeja): el aro rojo del vanilla. El estado lo dicen la
          // marca y el texto para el lector; el aro sólo refuerza.
          activo ? "ring-2 ring-accent" : celda.atencion && "ring-2 ring-danger",
        )}
      >
        {/* El estado siempre con forma + palabra (nunca sólo el color del fondo), también en el turno de una hora.
            En uno de media hora (una franja) la marca va al lado del nombre. */}
        <span className="flex w-full min-w-0 items-baseline gap-1.5">
          {/* «Debe» de antes: el punto rojo SIEMPRE, también en el turno de una hora (antes sólo si medía más de 2 franjas).
              El monto va en la etiqueta para el lector. */}
          {celda.deudor && <span aria-hidden="true" data-turno-deuda="" title="Debe de antes" className="size-2 shrink-0 self-center rounded-full bg-danger" />}
          <span className="truncate font-semibold text-strong">{celda.titular}</span>
          {(celda.nuevo || celda.web || fijo) && (
            <span aria-hidden="true" data-turno-marcas="" className="flex shrink-0 gap-1">
              {celda.nuevo && <span data-turno-marca="nuevo" className="rounded-sm border border-line-strong px-1 text-[10px] font-bold uppercase leading-4 tracking-wide text-strong">Nuevo</span>}
              {celda.web && <span data-turno-marca="web" className="rounded-sm border border-accent px-1 text-[10px] font-bold uppercase leading-4 tracking-wide text-accent">Web</span>}
              {fijo && <span data-turno-marca="fijo" className="rounded-sm border border-warning px-1 text-[10px] font-bold uppercase leading-4 tracking-wide text-warning">Fijo</span>}
            </span>
          )}
          {celda.alto < 2 && (
            <span data-turno-parte="estado" className="contents">
              <Marca tipo={celda.marca.tipo} className="shrink-0">{celda.marca.texto}</Marca>
            </span>
          )}
        </span>
        {celda.alto >= 2 && (
          <span className={cn("w-full truncate text-xs tabular-nums", celda.estado === "reservada" || celda.estado === "en_cancha" ? "text-muted" : "text-body")}>
            {celda.horario} · {celda.jugadores}
            {celda.tipo && celda.tipo !== "Turno" && !fijo ? ` · ${celda.tipo}` : ""}
          </span>
        )}
        {celda.alto >= 2 && (
          <span data-turno-parte="estado" className="contents">
            <Marca tipo={celda.marca.tipo}>{celda.marca.texto}</Marca>
          </span>
        )}
        {celda.senal && <span className="w-full truncate text-xs font-semibold tabular-nums text-danger">{celda.senal}</span>}
      </button>
      {momento.length > 0 && (
        <span data-agenda="momento" className="pointer-events-none absolute inset-x-1 bottom-2 z-[3] flex gap-1">
          {momento.map((b) => (
            <button
              key={b.accion}
              type="button"
              data-momento={b.accion}
              aria-label={b.etiqueta}
              aria-haspopup={necesitaMenu(b) ? "menu" : undefined}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onMomento(celda.id, b, r.left, r.bottom + 4);
              }}
              className="pointer-events-auto relative inline-flex min-h-11 min-w-0 max-w-full items-center rounded-md border border-line-strong bg-surface-raised px-2 text-xs font-semibold text-strong tabular-nums hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              {b.accion === "abrir" && b.monto > 0 && <span aria-hidden="true" className="mr-1 size-2 shrink-0 rounded-full bg-danger" />}
              <span className="min-w-0 truncate">{b.texto}</span>
            </button>
          ))}
        </span>
      )}
      {movible && (
        <>
          {/* La manija para mover con el dedo (con el mouse se arrastra el turno entero). */}
          <span
            aria-hidden="true"
            data-agenda="manija"
            title="Arrastrá para moverlo"
            onPointerDown={(e) => onArrastrar(celda.id, "mover", e)}
            className="absolute right-0.5 top-0.5 z-[2] grid size-6 cursor-grab touch-none place-items-center rounded text-xs text-muted"
          >
            ⠿
          </span>
          {/* Estirar: la duración crece de a media hora, hasta donde haya lugar. */}
          <span
            aria-hidden="true"
            data-agenda="estirar"
            title="Estirá para alargar el turno"
            onPointerDown={(e) => onArrastrar(celda.id, "estirar", e)}
            className="absolute inset-x-2 bottom-0 z-[2] h-2 cursor-ns-resize touch-none rounded-b"
          />
        </>
      )}
    </li>
  );
});

/**
 * Una franja libre: tocarla abre el alta desde esa hora. Mide una franja (44 px, como todo lo que se toca en la
 * tablet). Entra a la navegación con flechas de la grilla; con Tab se llega a los turnos (y, en un día vacío, al
 * primer hueco), así no son cien paradas de Tab.
 */
const Franja = memo(function Franja({
  franja,
  enTab,
  onReservar,
}: {
  franja: FranjaLibre;
  enTab: boolean;
  onReservar: (canchaId: string, min: number) => void;
}) {
  return (
    <li className="flex min-w-0" style={{ gridColumn: franja.columna + 2, gridRow: `${franja.fila + 2} / span 1` }}>
      <button
        type="button"
        id={idDeCelda(franja.id)}
        data-celda={franja.id}
        data-agenda="libre"
        tabIndex={enTab ? 0 : -1}
        onClick={() => onReservar(franja.canchaId, franja.min)}
        aria-label={franja.etiqueta}
        aria-describedby={franja.corto ? `${idDeCelda(franja.id)}-entra` : undefined}
        data-corto={franja.corto ? "" : undefined}
        className="z-0 m-px flex min-h-11 w-full items-center justify-center rounded text-xs text-faint tabular-nums hover:bg-accent-soft hover:text-strong focus-visible:outline-2 focus-visible:outline-focus"
      >
        + {franja.hora}
        {/* No aguanta la duración de siempre: se dice cuánto entra (y la piel le pone trama) antes de tocar. */}
        {franja.corto && <span aria-hidden="true">&nbsp;· {franja.cuantoEntra} min</span>}
      </button>
      {franja.corto && (
        <span id={`${idDeCelda(franja.id)}-entra`} className="sr-only">
          Entran {franja.cuantoEntra} minutos.
        </span>
      )}
    </li>
  );
});

/**
 * El menú rápido del turno: lo de todos los días a un toque. Escape o tocar afuera lo cierran (el foco vuelve al turno).
 * «Cobrar la seña y abrir» despliega los 4 medios en el mismo menú (un toque más, sin abrir la hoja: bp-DISENO §2.2).
 */
function MenuDelTurno({ id, x, y, opciones, onElegir, onCerrar }: { id: string; x: number; y: number; opciones: OpcionDelMenu[]; onElegir: (o: OpcionDelMenu) => void; onCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const [conMedios, setConMedios] = useState<OpcionDelMenu | null>(null);
  // Al pasar a los medios (o volver), el foco va al primero.
  useEffect(() => {
    caja.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  }, [conMedios]);
  useEffect(() => {
    const m = caja.current;
    if (!m) return;
    m.style.left = `${Math.max(8, Math.min(x, window.innerWidth - m.offsetWidth - 8))}px`;
    m.style.top = `${Math.max(8, Math.min(y, window.innerHeight - m.offsetHeight - 8))}px`;
    m.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const afuera = (e: PointerEvent) => {
      if (!m.contains(e.target as Node)) onCerrar();
    };
    document.addEventListener("pointerdown", afuera);
    return () => document.removeEventListener("pointerdown", afuera);
  }, [x, y, onCerrar]);
  const cerrar = () => {
    onCerrar();
    document.getElementById(`turno-${id}`)?.focus();
  };
  return (
    <div
      ref={caja}
      role="menu"
      aria-label={conMedios ? `${conMedios.texto}: ¿cómo paga?` : "Acciones rápidas del turno"}
      data-ui="menu-del-turno"
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          cerrar();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const items = [...(caja.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem], [role=menuitemcheckbox]") ?? [])];
          const i = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }
      }}
      className="fixed z-50 flex min-w-52 flex-col rounded-lg border border-line bg-surface-raised p-1 shadow-overlay"
    >
      {conMedios ? (
        <>
          <p aria-hidden="true" className="px-3 pb-1 pt-2 text-sm font-semibold text-strong">{conMedios.texto}: ¿cómo paga?</p>
          {MEDIOS_CAJA.map((m) => (
            <button key={m} type="button" role="menuitem" onClick={() => onElegir({ ...conMedios, medio: m })} className="min-h-11 rounded-md px-3 text-left text-sm text-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus">
              {ETIQUETA_MEDIO[m]}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={() => setConMedios(null)} className="min-h-11 rounded-md px-3 text-left text-sm text-muted hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus">
            Volver
          </button>
        </>
      ) : opciones.map((o) => (
        <button
          key={o.accion}
          type="button"
          role="menuitem"
          data-menu={o.peligro ? "peligro" : undefined}
          onClick={() => (o.accion === "cobrarSenaYAbrir" && !o.medio ? setConMedios(o) : onElegir(o))}
          className={cn(
            "min-h-11 rounded-md px-3 text-left text-sm hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus",
            // La falta, separada y en rojo como el club de hoy: es de una sola vez (igual se deshace desde el aviso).
            o.peligro ? "relative mt-1 text-danger before:absolute before:inset-x-1 before:-top-0.5 before:border-t before:border-line" : "text-strong",
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/**
 * El botón del momento abre un menú chico (los medios, o «Debe de antes»): no hace nada al primer toque. «Cerrar la de X y
 * abrir» siempre lo abre: cierra el turno de OTRO (con lo que debe, la seña del que llega y si la mesa sigue).
 */
const necesitaMenu = (b: BotonDelMomento) => (b.accion === "abrir" || b.accion === "cobrarSenaYAbrir" ? b.monto > 0 : b.accion === "cobrar" || b.accion === "cerrarYAbrir");

type PasoDelMomento = { paso: "deuda" } | { paso: "medios"; para: "deuda" | "sena" | "cobrar" } | { paso: "senaDelQueLlega" } | { paso: "cerrarLaDe" };

/** Lo que «Cerrar la de X y abrir» le pasa al comando «cierre» además de los dos turnos. */
export type CerrarYAbrirDelMomento = { medio?: MedioCaja; aCuenta?: boolean; seguir: boolean; medioSena: MedioCaja | null };

/** La seña del que llega: con la que se eligió; cubierta con pagos (falta $ 0), se marca paga sin cobrar (como la cuenta). */
const senaElegida = (sena: number | null, medio: MedioCaja | null): MedioCaja | null => (sena === null ? null : (medio ?? "efectivo"));

/** Por dónde arranca el menú: la seña del que llega primero (si falta algo), después lo que debe el que se va. */
function primerPaso(b: BotonDelMomento): PasoDelMomento {
  if (b.accion === "cerrarYAbrir") return b.ocupada?.sena ? { paso: "senaDelQueLlega" } : { paso: "cerrarLaDe" };
  return b.accion === "abrir" ? { paso: "deuda" } : { paso: "medios", para: b.accion === "cobrar" ? "cobrar" : "sena" };
}

/** El título del menú (y su nombre para el lector de pantalla), según el paso. */
function tituloDelMenu(boton: BotonDelMomento, paso: PasoDelMomento): string {
  const o = boton.ocupada;
  switch (paso.paso) {
    case "senaDelQueLlega":
      return `Seña de ${o?.llega ?? "quien llega"} ${pesos(o?.sena ?? 0)}: ¿cómo paga?`;
    case "cerrarLaDe":
      return o && o.debe > 0 ? `${o.titular} debe ${pesos(o.debe)}: ¿cómo paga y se abre?` : `Cerrar la de ${o?.titular ?? "la cancha"} y abrir`;
    case "deuda":
      return `Debe ${pesos(boton.monto)} de antes`;
    case "medios":
      return paso.para === "deuda" ? `Cobrar ${pesos(boton.monto)} de la deuda y abrir: ¿cómo paga?` : paso.para === "sena" ? `Seña ${pesos(boton.monto)} y abrir: ¿cómo paga?` : `Cobrar ${pesos(boton.monto)}: ¿cómo paga?`;
  }
}

/**
 * El menú del botón del momento: «Debe $X de antes · Cobrar ahora / Después» y los 4 medios (seña, cobrar la cancha,
 * la deuda). Mismo manejo que el menú rápido: Escape o Tab lo cierran (el foco vuelve al botón), flechas para recorrerlo.
 */
function MenuDelMomento({
  boton,
  x,
  y,
  onMedio,
  onAbrirSinCobrar,
  onDividir,
  onCerrarYAbrir,
  onCerrar,
}: {
  boton: BotonDelMomento;
  x: number;
  y: number;
  onMedio: (para: "deuda" | "sena" | "cobrar", medio: MedioCaja) => void;
  onAbrirSinCobrar: () => void;
  onDividir: () => void;
  /** «Cerrar la de X y abrir»: lo elegido en el menú (medio o cuenta corriente de X, seña del que llega, la mesa sigue). */
  onCerrarYAbrir: (a: CerrarYAbrirDelMomento) => void;
  onCerrar: (devolverFoco: boolean) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [paso, setPaso] = useState<PasoDelMomento>(() => primerPaso(boton));
  // «Cerrar la de X y abrir»: con qué paga la seña el que llega (null: no se eligió todavía) y si la mesa de X sigue.
  const [medioSena, setMedioSena] = useState<MedioCaja | null>(null);
  const [seguir, setSeguir] = useState(false);
  useEffect(() => {
    caja.current?.querySelector<HTMLButtonElement>("[role=menuitem], [role=menuitemcheckbox]")?.focus();
  }, [paso]);
  useEffect(() => {
    const m = caja.current;
    if (!m) return;
    m.style.left = `${Math.max(8, Math.min(x, window.innerWidth - m.offsetWidth - 8))}px`;
    m.style.top = `${Math.max(8, Math.min(y, window.innerHeight - m.offsetHeight - 8))}px`;
    const afuera = (e: PointerEvent) => {
      if (!m.contains(e.target as Node)) onCerrar(false);
    };
    document.addEventListener("pointerdown", afuera);
    return () => document.removeEventListener("pointerdown", afuera);
  }, [x, y, onCerrar]);
  const ocupada = boton.ocupada;
  const titulo = tituloDelMenu(boton, paso);
  const item = "min-h-11 rounded-md px-3 text-left text-sm hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus";
  return (
    <div
      ref={caja}
      role="menu"
      aria-label={titulo}
      data-ui="menu-del-momento"
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          onCerrar(true);
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const items = [...(caja.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem], [role=menuitemcheckbox]") ?? [])];
          const i = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }
      }}
      className="fixed z-50 flex min-w-52 flex-col rounded-lg border border-line bg-surface-raised p-1 shadow-overlay"
    >
      <p aria-hidden="true" className="px-3 pb-1 pt-2 text-sm font-semibold text-strong tabular-nums">
        {titulo}
      </p>
      {paso.paso === "senaDelQueLlega" ? (
        MEDIOS_CAJA.map((m) => (
          <button
            key={m}
            type="button"
            role="menuitem"
            onClick={() => {
              setMedioSena(m);
              setPaso({ paso: "cerrarLaDe" });
            }}
            className={cn(item, "text-strong")}
          >
            {ETIQUETA_MEDIO[m]}
          </button>
        ))
      ) : paso.paso === "cerrarLaDe" && ocupada ? (
        <>
          {ocupada.debe > 0 ? (
            <>
              {MEDIOS_CAJA.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="menuitem"
                  aria-label={`${ocupada.titular} paga ${pesos(ocupada.debe)} en ${ETIQUETA_MEDIO[m]} y se abre la de ${ocupada.llega}`}
                  onClick={() => onCerrarYAbrir({ medio: m, seguir, medioSena: senaElegida(ocupada.sena, medioSena) })}
                  className={cn(item, "text-strong")}
                >
                  {ETIQUETA_MEDIO[m]}
                </button>
              ))}
              {ocupada.aCuenta && (
                <button type="button" role="menuitem" onClick={() => onCerrarYAbrir({ aCuenta: true, seguir, medioSena: senaElegida(ocupada.sena, medioSena) })} className={cn(item, "text-strong")}>
                  A su cuenta corriente y abrir
                </button>
              )}
            </>
          ) : (
            <button type="button" role="menuitem" onClick={() => onCerrarYAbrir({ seguir, medioSena: senaElegida(ocupada.sena, medioSena) })} className={cn(item, "text-strong")}>
              Cerrar la de {ocupada.titular} y abrir
            </button>
          )}
          {/* «La mesa sigue»: X se queda a comer; su mesa pasa a Buffet (el mismo tilde que en la cuenta del turno). */}
          <button type="button" role="menuitemcheckbox" aria-checked={seguir} onClick={() => setSeguir((v) => !v)} className={cn(item, "flex items-center gap-2 text-strong")}>
            <span aria-hidden="true" className="inline-grid size-5 place-items-center rounded-sm border border-line-strong text-xs">
              {seguir ? "✓" : ""}
            </span>
            Se quedan a comer: la mesa sigue en Buffet
          </button>
          {ocupada.sena ? (
            <button type="button" role="menuitem" onClick={() => setPaso({ paso: "senaDelQueLlega" })} className={cn(item, "text-muted")}>
              Volver (seña{medioSena ? ` en ${ETIQUETA_MEDIO[medioSena]}` : ""})
            </button>
          ) : null}
        </>
      ) : paso.paso === "deuda" ? (
        <>
          <button type="button" role="menuitem" onClick={() => setPaso({ paso: "medios", para: "deuda" })} className={cn(item, "text-strong")}>
            Cobrar ahora y abrir
          </button>
          <button type="button" role="menuitem" onClick={onAbrirSinCobrar} className={cn(item, "text-strong")}>
            Después: abrir igual
          </button>
        </>
      ) : paso.paso === "medios" ? (
        <>
          {MEDIOS_CAJA.map((m) => (
            <button key={m} type="button" role="menuitem" onClick={() => onMedio(paso.para, m)} className={cn(item, "text-strong")}>
              {ETIQUETA_MEDIO[m]}
            </button>
          ))}
          {paso.para === "cobrar" && (
            <button type="button" role="menuitem" onClick={onDividir} className={cn(item, "text-strong")}>
              Dividir o cobrar por jugador…
            </button>
          )}
          {boton.accion === "abrir" && (
            <button type="button" role="menuitem" onClick={() => setPaso({ paso: "deuda" })} className={cn(item, "text-muted")}>
              Volver
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}

const hhmmDe = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;

/** El id del DOM de una celda (turno o hueco libre), para mover el foco con las flechas. */
function idDeCelda(id: string): string {
  return id.includes("@") ? `libre-${id.replace("@", "-")}` : `turno-${id}`;
}

const mismaLuz = (_: boolean | undefined, nueva: boolean) => nueva;

/**
 * La luz de una cancha: prendida (círculo lleno) o apagada (círculo vacío), con `aria-pressed`. Lee SÓLO
 * `luces[canchaId]`: cambiar una luz repinta este botón y nada más. Prender o apagar a mano se deshace (como el
 * vanilla, `luz` en DESHACIBLES).
 */
const LuzDeCancha = memo(function LuzDeCancha({ almacen, canchaId, nombre }: { almacen: Almacen; canchaId: string; nombre: string }) {
  const leer = useCallback((e: EstadoClub) => !!e.luces[canchaId], [canchaId]);
  const prendida = useSeleccion(almacen, leer, mismaLuz);
  return (
    <button
      type="button"
      aria-pressed={prendida}
      data-agenda="luz"
      aria-label={`Luz de ${nombre}`}
      title={prendida ? "Luz prendida: tocá para apagarla" : "Luz apagada: tocá para prenderla"}
      onClick={() => almacen.comando("luz", [canchaId, !prendida], { deshacible: true })}
      // 44 × 44 para el dedo, pero a la vista una chapa de 32 px con aire: el margen negativo hace que ocupe 32 de alto
      // y 38 de ancho en la cabecera (el área de toque sobrante no le saca lugar al nombre de la cancha).
      className="group -my-1.5 -ml-1.5 inline-grid size-11 shrink-0 place-items-center rounded-md focus-visible:outline-none"
    >
      <span
        data-agenda="luz-chapa"
        className={cn(
          "grid size-8 place-items-center rounded-md border group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-focus",
          prendida ? "border-warning bg-warning-soft text-strong" : "border-line-strong bg-surface-raised text-body",
        )}
      >
        {/* La lamparita del club de hoy: llena y dorada prendida, sólo el contorno apagada (forma, no sólo color). */}
        <svg viewBox="0 0 24 24" aria-hidden="true" data-agenda="lamparita" className="size-5" fill={prendida ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
        </svg>
      </span>
    </button>
  );
});

/** El fondo fijo de la grilla (encabezados, horas y franjas). Sólo cambia si cambian las canchas o el horario. */
const FondoDeLaGrilla = memo(function FondoDeLaGrilla({ almacen, canchas, horas, filas }: { almacen: Almacen } & Pick<VistaAgenda, "canchas" | "horas" | "filas">) {
  return (
    <>
      <div className="sticky left-0 top-0 z-30 border-b border-line bg-surface" style={{ gridColumn: 1, gridRow: 1 }} />
      {canchas.map((c, i) => (
        <div
          key={c.id}
          data-agenda="cancha"
          className="sticky top-0 z-20 flex items-center gap-1 border-b border-l border-line bg-surface pl-2"
          style={{ gridColumn: i + 2, gridRow: 1 }}
        >
          {/* El nombre ya lo dice la lista de la cancha (aria-label): acá sólo se ve. */}
          <span aria-hidden className="flex min-w-0 flex-1 flex-col justify-center">
            <span className="truncate font-semibold text-strong">{c.nombre}</span>
            <span className="truncate text-xs text-muted">{c.detalle}</span>
          </span>
          <LuzDeCancha almacen={almacen} canchaId={c.id} nombre={c.nombre} />
        </div>
      ))}
      {horas.map((h) => (
        <div
          key={h.texto}
          aria-hidden
          className="sticky left-0 z-10 bg-surface pr-2 pt-0.5 text-right text-xs tabular-nums text-muted"
          style={{ gridColumn: 1, gridRow: `${h.fila + 2} / span 2` }}
        >
          {h.texto}
        </div>
      ))}
      {canchas.map((c, i) => (
        <div
          key={`fondo-${c.id}`}
          aria-hidden
          className="border-l border-line"
          style={{
            gridColumn: i + 2,
            gridRow: `2 / span ${filas}`,
            backgroundImage: "linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
            backgroundSize: `100% calc(${FILA} * 2)`,
          }}
        />
      ))}
    </>
  );
});

export default function AgendaCanchas({
  almacen,
  dia,
  abierto,
  onAbrir,
  onReservar,
  dias = null,
  accesos = null,
  atajoTurno = false,
  cambiarHorario = null,
}: {
  /** «Cambiar horario» al lado del horario del día (lo arma ClubDemo, sólo para quien configura). */
  cambiarHorario?: ReactNode;
  /** «+ Turno» anuncia su tecla (N) si los atajos de una tecla están prendidos. */
  atajoTurno?: boolean;
  almacen: Almacen;
  /** Los días (debajo del título, como el club de hoy) y los accesos de la agenda (lista de espera, mantenimiento). */
  dias?: ReactNode;
  accesos?: ReactNode;
  /** El día que se muestra ("AAAA-MM-DD"). */
  dia: string;
  abierto: string | null;
  onAbrir: (id: string) => void;
  /**
   * Dar un turno: en una cancha y desde una hora (null = la primera libre). «Buscar lugar» pasa también la duración que
   * se buscó (quien abre el alta puede usarla; si no, el alta arranca con la de siempre y conserva la hora).
   */
  onReservar: (canchaId: string, min: number | null, duracion?: number) => void;
}) {
  const seleccionar = useCallback((e: EstadoClub, a: Ahora) => armarAgenda(e, dia, a), [dia]);
  const vista = useSeleccion(almacen, seleccionar, compartir);
  const marco = useRef<HTMLDivElement>(null);
  const grilla = useRef<HTMLDivElement>(null);
  const yaUbicada = useRef(false);

  // Al entrar, la grilla arranca mostrando la hora de ahora (no las 9 de la mañana). Una sola vez:
  // después manda la persona.
  const filaAhora = vista.ahora;
  useEffect(() => {
    const m = marco.current;
    const g = grilla.current;
    if (!m || !g || filaAhora === null || yaUbicada.current) return;
    yaUbicada.current = true;
    // Como el club de hoy: desde la hora en punto de dos horas antes (19:10 → 17:00), con media hora libre arriba.
    const min = vista.desde + filaAhora * vista.paso;
    const fila = Math.max(0, (Math.floor(min / 60) * 60 - 120 - vista.desde) / vista.paso - 30 / vista.paso);
    m.scrollTop = fila * medidasDeLaGrilla(g).fila;
  }, [filaAhora, vista.desde, vista.paso]);

  const turnos = vista.turnos;
  const libres = vista.libres;
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // ── Arrastrar y estirar (pointer events: mouse, dedo y lápiz) ──
  const [previa, setPrevia] = useState<PreviaArrastre | null>(null);
  // La vista del momento para los oyentes del arrastre (viven fuera del render).
  const vistaActual = useRef(vista);
  useEffect(() => {
    vistaActual.current = vista;
  }, [vista]);
  const recienArrastrado = useRef(false);
  const hacerCiclo = useCallback(
    (id: string, p: PreviaArrastre) => {
      if (!p.ok) {
        if (p.motivo) almacen.informar({ ok: false, mensaje: p.motivo });
        return;
      }
      const accion = p.modo === "mover" ? { tipo: "mover" as const, canchaId: p.canchaId, inicio: p.inicio } : { tipo: "extender" as const, minutos: p.minutos };
      almacen.comando("ciclo", [id, accion], { deshacible: true });
    },
    [almacen],
  );
  const onArrastrar = useCallback(
    (id: string, modo: "mover" | "estirar", ev: React.PointerEvent) => {
      const g = grilla.current;
      const m = marco.current;
      const bloque = document.getElementById(`turno-${id}`);
      if (!g || !m || !bloque) return;
      if (modo === "estirar" || ev.pointerType !== "mouse") ev.preventDefault();
      const medidas = medidasDeLaGrilla(g);
      const x0 = ev.clientX;
      const y0 = ev.clientY;
      const scroll0 = m.scrollTop;
      const agarre = Math.floor((ev.clientY - bloque.getBoundingClientRect().top) / medidas.fila);
      let activo = false;
      let ultima: PreviaArrastre | null = null;
      const puntero = { x: x0, y: y0 };
      let cuadro = 0;
      const calcular = (x: number, y: number) => {
        const v = vistaActual.current;
        const r = g.getBoundingClientRect();
        const colW = (r.width - medidas.horas) / v.canchas.length;
        return modo === "mover"
          ? previaArrastre(almacen.estado(), v, id, { modo: "mover", columna: Math.floor((x - r.left - medidas.horas) / colW), fila: Math.floor((y - r.top - medidas.cabecera) / medidas.fila) - agarre }, almacen.ahora())
          : // Estirar cuenta desde donde se agarró; si la grilla se corrió mientras tanto, eso también suma.
            previaArrastre(almacen.estado(), v, id, { modo: "estirar", filas: (y - y0 + m.scrollTop - scroll0) / medidas.fila }, almacen.ahora());
      };
      // Llegando al borde de la grilla, se corre sola (arriba, abajo y, moviendo, a los costados) mientras el puntero
      // siga ahí; la previa acompaña. Se frena en el tope o al soltar.
      const correr = () => {
        cuadro = 0;
        if (!activo) return;
        const r = m.getBoundingClientRect();
        const dy = velocidadAlBorde(puntero.y, r.top + medidas.cabecera, r.bottom);
        const dx = modo === "mover" ? velocidadAlBorde(puntero.x, r.left + medidas.horas, r.right) : 0;
        if (!dx && !dy) return;
        const antes = m.scrollTop + m.scrollLeft;
        m.scrollTop += dy;
        m.scrollLeft += dx;
        if (m.scrollTop + m.scrollLeft === antes) return;
        ultima = calcular(puntero.x, puntero.y);
        setPrevia(ultima);
        cuadro = requestAnimationFrame(correr);
      };
      const mover = (e: PointerEvent) => {
        if (!activo && Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
        activo = true;
        puntero.x = e.clientX;
        puntero.y = e.clientY;
        ultima = calcular(e.clientX, e.clientY);
        setPrevia(ultima);
        if (!cuadro) cuadro = requestAnimationFrame(correr);
      };
      const terminar = (e: PointerEvent | KeyboardEvent) => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", terminar);
        window.removeEventListener("pointercancel", terminar);
        window.removeEventListener("keydown", cancelarConEscape);
        cancelAnimationFrame(cuadro);
        cuadro = 0;
        setPrevia(null);
        if (!activo) return;
        activo = false;
        recienArrastrado.current = true;
        setTimeout(() => (recienArrastrado.current = false), 0);
        if (e.type === "pointerup" && ultima) hacerCiclo(id, ultima);
      };
      const cancelarConEscape = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        ultima = null;
        terminar(e);
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", terminar);
      window.addEventListener("pointercancel", terminar);
      window.addEventListener("keydown", cancelarConEscape);
    },
    [almacen, hacerCiclo],
  );
  // La alternativa de teclado: Alt + ↑/↓ media hora antes o después, Alt + ←/→ la cancha de al lado, Alt + Mayúscula + ↓
  // alarga media hora. El foco queda en el turno.
  const moverConTeclado = useCallback(
    (id: string, e: React.KeyboardEvent) => {
      if (!e.altKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const v = vistaActual.current;
      const r = almacen.estado().reservas.find((x) => x.id === id);
      if (!r) return;
      const columna = v.canchas.findIndex((c) => c.id === r.canchaId);
      const fila = Math.round((r.inicio - v.desde) / v.paso);
      const p =
        e.shiftKey && e.key === "ArrowDown"
          ? previaArrastre(almacen.estado(), v, id, { modo: "estirar", filas: 1 }, almacen.ahora())
          : previaArrastre(almacen.estado(), v, id, {
              modo: "mover",
              columna: columna + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0),
              fila: fila + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0),
            }, almacen.ahora());
      if (!p) return;
      if (p.modo === "mover" && !p.ok && !p.motivo) return; // contra el borde: no se mueve
      hacerCiclo(id, p);
      requestAnimationFrame(() => document.getElementById(`turno-${id}`)?.focus());
    },
    [almacen, hacerCiclo],
  );
  const abrirSiNoSeArrastro = useCallback(
    (id: string) => {
      if (recienArrastrado.current) return;
      onAbrir(id);
    },
    [onAbrir],
  );
  const abrirMenu = useCallback((id: string, x: number, y: number) => setMenu({ id, x, y }), []);

  // ── El botón del momento (bp-DISENO §2.2): lo de un toque sale directo; lo que pide un medio abre su menú chico ──
  const [momento, setMomento] = useState<{ id: string; boton: BotonDelMomento; x: number; y: number } | null>(null);
  const alMomento = useCallback(
    (id: string, b: BotonDelMomento, x: number, y: number) => {
      if (necesitaMenu(b)) return setMomento({ id, boton: b, x, y });
      switch (b.accion) {
        case "abrir":
          almacen.comando("cuenta", [id, { tipo: "abrirCancha" }], { deshacible: DESHACIBLE.abrirCancha });
          return;
        case "cobrarSenaYAbrir":
          // La seña ya está cubierta con pagos: abre sin cobrar (el medio no se usa).
          almacen.comando("cuenta", [id, { tipo: "cobrarSenaYAbrir", medio: "efectivo" }], { deshacible: DESHACIBLE.cobrarSenaYAbrir });
          return;
        case "extender":
          almacen.comando("ciclo", [id, { tipo: "extender", minutos: b.minutos ?? 30 }], { deshacible: true });
          return;
        case "cerrar":
          almacen.comando("cuenta", [id, { tipo: "cerrarCancha" }], { deshacible: DESHACIBLE.cerrarCancha });
          return;
        case "mesaSigue":
          // La cancha está paga: no se cobra nada (el medio no se usa); la mesa pasa a Buffet → Mesas.
          almacen.comando("cuenta", [id, { tipo: "cerrarYSeguir", medio: "efectivo" }], { deshacible: DESHACIBLE.cerrarYSeguir });
          return;
        case "noVino":
          onAbrir(id);
          desplegarEnLaCuenta("falta");
          return;
      }
    },
    [almacen, onAbrir],
  );
  const cerrarMomento = useCallback(
    (devolverFoco: boolean) => {
      const id = momento?.id;
      const accion = momento?.boton.accion;
      setMomento(null);
      if (devolverFoco && id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`#turno-${CSS.escape(id)} ~ [data-agenda="momento"] [data-momento="${accion}"]`)?.focus());
    },
    [momento],
  );
  const medioDelMomento = useCallback(
    (para: "deuda" | "sena" | "cobrar", medio: MedioCaja) => {
      if (!momento) return;
      const { id, boton } = momento;
      const d =
        para === "deuda"
          ? almacen.comando("abrirConDeuda", [id, medio], { deshacible: true, promete: true })
          : para === "sena"
            ? almacen.comando("cuenta", [id, { tipo: "cobrarSenaYAbrir", medio }], { deshacible: DESHACIBLE.cobrarSenaYAbrir })
            : almacen.comando("cuenta", [id, { tipo: "cobrarCancha", monto: boton.monto, medio }], { deshacible: DESHACIBLE.cobrarCancha });
      // Si no entró (p. ej. sin internet por MP: «Elegí Efectivo…»), los medios quedan abiertos para elegir otro; el aviso
      // sale en el role="alert" de abajo.
      if (!d.ok) return;
      setMomento(null);
      requestAnimationFrame(() => document.getElementById(`turno-${id}`)?.focus());
    },
    [almacen, momento],
  );

  // «Cerrar la de X y abrir» desde el bloque (Tanda 2: `canchaOcupada` + el comando «cierre» de 2D): cerrar el turno que
  // ocupa la cancha (lo que debe, con su medio o a su cuenta corriente; su mesa sigue si se quedan) y abrir el que llega
  // (con su seña), en UN comando: o pasan las dos o ninguna. La recepción no tiene que entrar a la cuenta.
  const cerrarYAbrirDelMomento = useCallback(
    (a: CerrarYAbrirDelMomento) => {
      const cerrarId = momento?.boton.ocupada?.cerrarId;
      if (!momento || !cerrarId) return;
      const { id } = momento;
      // Si no entró (sin internet con MP, la seña que no alcanza…), lo elegido queda a la vista para cambiarlo.
      if (!almacen.comando("cierre", [{ tipo: "cerrarYAbrir", cerrarId, abrirId: id, ...a }], { deshacible: true }).ok) return;
      setMomento(null);
      requestAnimationFrame(() => document.getElementById(`turno-${id}`)?.focus());
    },
    [almacen, momento],
  );

  // ── «Buscar lugar» y «Compartir lo libre» (arriba, junto a «+ Turno»): uno abierto a la vez ──
  const [herramienta, setHerramienta] = useState<"buscar" | "libre" | null>(null);
  const idsHerramienta = { buscar: `club-buscar-lugar`, libre: `club-lo-libre` } as const;
  const elegirLugar = useCallback(
    (canchaId: string, inicio: number, duracion: number) => {
      setHerramienta(null);
      onReservar(canchaId, inicio, duracion);
    },
    [onReservar],
  );
  const cerrarMenu = useCallback(() => setMenu(null), []);
  const elegirDelMenu = useCallback(
    (o: OpcionDelMenu) => {
      const id = menu?.id;
      setMenu(null);
      if (!id) return;
      // El foco vuelve al turno; si la acción abrió la cuenta (la hoja), queda en ella.
      requestAnimationFrame(() => {
        if (!document.querySelector('[data-ui="hoja-del-turno"]')) document.getElementById(`turno-${id}`)?.focus();
      });
      const accion = o.accion;
      if (accion === "ver") return onAbrir(id);
      if (accion === "mover" || accion === "falta") {
        onAbrir(id);
        return desplegarEnLaCuenta(accion);
      }
      // BP-005/006: la seña con el medio elegido y la cancha abierta, en un comando (un doble toque no cobra dos veces).
      if (accion === "cobrarSenaYAbrir") {
        if (o.medio) almacen.comando("cuenta", [id, { tipo: "cobrarSenaYAbrir", medio: o.medio }], { deshacible: DESHACIBLE.cobrarSenaYAbrir });
        return;
      }
      almacen.comando("cuenta", [id, { tipo: accion }], { deshacible: DESHACIBLE[accion] });
    },
    [almacen, menu, onAbrir],
  );
  const alTeclear = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.altKey) return; // Alt + flechas mueven el turno (`moverConTeclado`)
      const dir = FLECHAS[e.key];
      const id = (e.target as HTMLElement).dataset?.celda;
      if (!dir || !id) return;
      // Turnos y huecos libres son celdas de la misma grilla: las flechas pasan por los dos.
      const destino = vecino([...turnos, ...libres.map((l) => ({ ...l, alto: 1 }))], id, dir);
      if (!destino) return;
      e.preventDefault();
      document.getElementById(idDeCelda(destino))?.focus();
    },
    [turnos, libres],
  );

  const porCancha = vista.canchas.map((c, i) => ({
    cancha: c,
    turnos: turnos.filter((t) => t.columna === i),
    libres: libres.filter((l) => l.columna === i),
  }));
  // Con Tab se entra a la grilla por los turnos; en un día sin turnos, por el primer hueco libre.
  const primerLibreEnTab = turnos.length === 0 ? (libres[0]?.id ?? null) : null;

  return (
    <section aria-labelledby="club-agenda-titulo" data-agenda-piel className="min-w-0">
      {/* Como el club de hoy: «AGENDA · SÁB 17/10 (HOY)» y, a la derecha, el horario del día con «Cambiar horario». */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="club-agenda-titulo" data-pantalla className="text-lg font-semibold text-strong">
          Agenda<span className="sr-only"> de canchas</span> · {vista.diaTitulo}
        </h2>
        <div data-tactil="compacto" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-muted">
            {vista.horarioTexto.split(": ")[0]}: <b className="font-semibold text-strong tabular-nums">{vista.horarioTexto.split(": ")[1]}</b>
          </p>
          {cambiarHorario}
        </div>
      </div>
      {dias}
      {/* Debajo de los días, a la izquierda: «+ Turno» primero y después los accesos (abrir cuenta, espera, lluvia). */}
      <div data-agenda="acciones" className="my-2 flex flex-wrap items-center gap-2">
        <Button variant="solid" size="md" aria-keyshortcuts={atajoTurno ? "N" : undefined} onClick={() => onReservar(vista.canchas.find((c) => !c.detalle.includes("mantenimiento"))?.id ?? vista.canchas[0]?.id ?? "", null)}>
          + Turno
        </Button>
        <Button variant="outline" size="md" aria-expanded={herramienta === "buscar"} aria-controls={idsHerramienta.buscar} onClick={() => setHerramienta((h) => (h === "buscar" ? null : "buscar"))}>
          Buscar lugar
        </Button>
        <Button variant="outline" size="md" aria-expanded={herramienta === "libre"} aria-controls={idsHerramienta.libre} onClick={() => setHerramienta((h) => (h === "libre" ? null : "libre"))}>
          Compartir lo libre
        </Button>
        {accesos}
        <p className="ml-auto text-xs text-muted">{vista.resumen}</p>
      </div>
      {herramienta === "buscar" && <BuscarLugar id={idsHerramienta.buscar} almacen={almacen} dia={dia} onElegir={elegirLugar} onCerrar={() => setHerramienta(null)} />}
      {herramienta === "libre" && <CompartirLoLibre id={idsHerramienta.libre} almacen={almacen} onCerrar={() => setHerramienta(null)} />}
      <p id="club-agenda-ayuda" className="sr-only">
        Cada cancha es una lista de turnos y huecos libres. Con las flechas pasás al de arriba, al de abajo o a la cancha de al lado. Enter abre la cuenta del turno o da un turno en el hueco.
      </p>
      <div
        ref={marco}
        onKeyDown={alTeclear}
        aria-describedby="club-agenda-ayuda"
        className="max-h-[70vh] overflow-auto overscroll-contain rounded-lg border border-line bg-surface"
      >
        <div
          ref={grilla}
          className="relative grid text-sm"
          style={{
            gridTemplateColumns: `3.5rem repeat(${vista.canchas.length}, minmax(8.75rem, 1fr))`,
            gridTemplateRows: `3rem repeat(${vista.filas}, ${FILA})`,
          }}
        >
          <FondoDeLaGrilla almacen={almacen} canchas={vista.canchas} horas={vista.horas} filas={vista.filas} />
          {filaAhora !== null && (
            <div
              aria-hidden
              className="pointer-events-none relative z-0"
              style={{ gridColumn: `2 / span ${vista.canchas.length}`, gridRow: `2 / span ${vista.filas}` }}
            >
              <div data-agenda="ahora" className="absolute inset-x-0 border-t-2 border-danger" style={{ top: `calc(${filaAhora} * ${FILA})` }} />
            </div>
          )}
          {filaAhora !== null && (
            // La hora de ahora en una pastilla sobre la columna de las horas, como el club de hoy.
            <div aria-hidden className="pointer-events-none sticky left-0 z-[31]" style={{ gridColumn: 1, gridRow: `2 / span ${vista.filas}` }}>
              <span data-agenda="ahora-hora" className="absolute right-0 -translate-y-1/2 rounded-sm px-1.5 py-px text-xs font-bold tabular-nums" style={{ top: `calc(${filaAhora} * ${FILA})` }}>
                {hhmmDe(vista.desde + filaAhora * vista.paso)}
              </span>
            </div>
          )}
          {previa && (
            // Dónde caería: verde si entra, rojo si choca (el motivo, para el lector, sale en el aviso al soltar).
            <div
              aria-hidden="true"
              data-agenda="previa"
              data-ok={previa.ok ? "si" : "no"}
              className={cn(
                "pointer-events-none z-30 m-0.5 flex items-start rounded-md border-2 border-dashed px-2 py-1 text-xs font-semibold",
                previa.ok ? "border-success bg-success-soft text-success" : "border-danger bg-danger-soft text-danger",
              )}
              style={{ gridColumn: previa.columna + 2, gridRow: `${previa.fila + 2} / span ${previa.alto}` }}
            >
              {previa.modo === "mover" ? `${vista.canchas[previa.columna]?.nombre ?? ""} · ${hhmmDe(previa.inicio)}` : `+${previa.minutos} min`}
              {!previa.ok && previa.motivo ? ` · ${previa.motivo}` : ""}
            </div>
          )}
          {vista.bloqueos.map((b) => (
            <div
              key={b.id}
              className="z-[1] m-0.5 flex flex-col overflow-hidden rounded-md border border-dashed border-line-strong bg-surface-sunken px-2 py-1 text-xs text-body"
              style={{ gridColumn: b.columna + 2, gridRow: `${b.fila + 2} / span ${b.alto}` }}
            >
              <span className="font-semibold text-strong">Bloqueada</span>
              <span className="truncate">{b.motivo}</span>
            </div>
          ))}
          {porCancha.map(({ cancha, turnos: deLaCancha, libres: libresDeLaCancha }) => (
            <ul
              key={cancha.id}
              role="list"
              aria-label={`${cancha.nombre}${cancha.detalle ? `, ${cancha.detalle}` : ""}: ${deLaCancha.length === 1 ? "1 turno" : `${deLaCancha.length} turnos`}, ${libresDeLaCancha.length} huecos libres`}
              className="contents"
            >
              {deLaCancha.map((t) => (
                <BloqueTurno key={t.id} celda={t} activo={t.id === abierto} onAbrir={abrirSiNoSeArrastro} onMenu={abrirMenu} onArrastrar={onArrastrar} onTecla={moverConTeclado} onMomento={alMomento} />
              ))}
              {libresDeLaCancha.map((f) => (
                <Franja key={f.id} franja={f} enTab={f.id === primerLibreEnTab} onReservar={onReservar} />
              ))}
            </ul>
          ))}
        </div>
      </div>
      {momento && (
        <MenuDelMomento
          key={`${momento.id}:${momento.boton.accion}`}
          boton={momento.boton}
          x={momento.x}
          y={momento.y}
          onMedio={medioDelMomento}
          onAbrirSinCobrar={() => {
            const id = momento.id;
            setMomento(null);
            almacen.comando("cuenta", [id, { tipo: "abrirCancha" }], { deshacible: DESHACIBLE.abrirCancha });
            requestAnimationFrame(() => document.getElementById(`turno-${id}`)?.focus());
          }}
          onCerrarYAbrir={cerrarYAbrirDelMomento}
          onDividir={() => {
            const id = momento.id;
            setMomento(null);
            onAbrir(id);
          }}
          onCerrar={cerrarMomento}
        />
      )}
      {menu && (
        <MenuDelTurno id={menu.id} x={menu.x} y={menu.y} opciones={opcionesDelMenu(almacen.estado(), menu.id, almacen.ahora().fecha)} onElegir={elegirDelMenu} onCerrar={cerrarMenu} />
      )}
    </section>
  );
}
