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
//     Arriba, el día (ayer, hoy y los cinco que siguen); abajo, lo cancelado, suspendido o la falta, con lo que haya
//     que devolver. Al lado, si no hay nada abierto, la bandeja «Para resolver ahora» (BandejaDelClub).
//   · Fijos y espera: los turnos fijos semanales y la lista de espera con los huecos que le sirven.
//   · Mantenimiento y lluvia: plan lluvia con su previa, canchas en mantenimiento y bloqueos de horario.
//   · Buffet: mesas que siguen cargando, cuentas abiertas, cargar productos, fiar con el OK del dueño.
//   · Tienda: los pedidos de la tienda para retirar (pegar el de WhatsApp, entregar, a la cuenta de alguien, cancelar).
//   · Caja: la caja de 12 a 12, egresos y cierre.
// Las solapas son estado del navegador (no enlaces): la demo no le pide nada al servidor.
// Todo aviso va a una sola barra, abajo, con «Deshacer» para la última acción.
//
// Nada va a la base: la cinta de arriba lo dice siempre. «Volver a la demo» tira lo tocado.
//
// MODO REAL (Ola 0): con `reloj="real"` el mismo shell corre la jornada real — hora de este equipo con latido, una
// sola pestaña por equipo (Web Lock) y el guardado enchufable (`guardado`, default este equipo). Hoy NADIE lo pide:
// /admin/club abre siempre la demo; lo decide el día de corte (ver page.tsx).
//
// Las piezas globales que suma la sesión del club (PIEZAS_GLOBALES_DEL_CLUB, solapas-club.ts: el bloqueo con PIN…)
// se montan una vez, arriba de todo, cada una en su chunk y pedidas apenas baja este archivo.
//
// Este archivo (y con él el motor) baja SÓLO en /admin/club: lo pide ClubCargador con
// `next/dynamic` y `ssr: false` (el motor guarda su contador de ids a nivel de módulo; en el
// servidor sería compartido entre pedidos).

import { Suspense, createElement, lazy, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/Button";
import { reserva as reservaDe, sumarDias } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { candadoDeLaJornada, claveDeLaDemo, claveDeLaJornada, crearAlmacen, type Almacen, type AlmacenamientoLocal, type GuardadoDelClub, type RolDelPanel } from "./almacen";
import CintaDelClub from "./CintaDelClub";
import { crearGuardadoEnLaBase, type PuertaDeLaBase } from "./guardado-en-la-base";
import { fechaLocal } from "./reloj-del-club";
import { useOperador, useSeleccion } from "./usar-almacen";
import AgendaCanchas from "./AgendaCanchas";
import AltaDeTurno from "./AltaDeTurno";
import { DiasDeLaAgenda, FueraDeLaGrilla } from "./AgendaExtras";
import { armarTira } from "./tira-de-solapas-core";
import PaletaDelClub from "./PaletaDelClub";
import type { AccionPaleta } from "./paleta-core";
import { pedirFichaDeCliente } from "./ficha-pedida";
import BandejaDelClub from "./BandejaDelClub";
import CuentaDelTurno from "./CuentaDelTurno";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { AvisosDelClub } from "./piezas";
import { NegocioDelClub } from "./negocio-del-club";
import { esDuenoQuienMira } from "./operador-del-club";
import { PIEZAS_GLOBALES_DEL_CLUB, SOLAPAS_DEL_CLUB, type PropsDePieza, type PropsDeSolapa } from "./solapas-club";

// PERFORMANCE (docs/producto/PERFORMANCE-TERMINALES.md, ronda 3): la Agenda (con la cuenta del turno y «Dar un
// turno») baja con la pantalla; las otras cinco solapas (Tienda incluida), en chunks aparte que se piden en cuanto el navegador
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
const tienda = diferida(() => import("./TiendaDelClub"));
const FijosYEspera = fijos.Solapa;
const CanchasDelClub = canchas.Solapa;
const BuffetDelClub = buffet.Solapa;
const CajaDelClub = caja.Solapa;
const TiendaDelClub = tienda.Solapa;
// Las solapas que suma la sesión del club (solapas-club.ts): mismo mecanismo, una por chunk.
const extras = SOLAPAS_DEL_CLUB.map((s) => ({ ...s, diferida: diferida<PropsDeSolapa>(s.cargar) }));
// Las piezas globales: cada una en su chunk, pedidas ya (al evaluar este archivo), sin esperar el reposo.
const piezas = PIEZAS_GLOBALES_DEL_CLUB.map((p) => ({ id: p.id, diferida: diferida<PropsDePieza>(p.cargar) }));
for (const p of piezas) void p.diferida.precargar().catch(() => undefined);
function precargarSolapas() {
  for (const d of [buffet, caja, tienda, fijos, canchas, ...extras.map((e) => e.diferida)]) void d.precargar().catch(() => undefined);
}
function SolapaCargando() {
  return (
    <div role="status" aria-label="Cargando la solapa" className="flex flex-col gap-3">
      <Esqueleto className="h-24 w-full rounded-lg" />
      <Esqueleto className="h-48 w-full rounded-lg" />
    </div>
  );
}

/** localStorage si el navegador lo deja (en incógnito o sin lugar puede tirar): si no, la demo vive en memoria. */
function guardadoDelEquipo(): AlmacenamientoLocal | null {
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
  { id: "tienda", etiqueta: "Tienda" },
  { id: "caja", etiqueta: "Caja" },
];

/**
 * En la jornada real, sin nadie que haya entrado con su PIN no se muestra NADA del club (ni la agenda, ni las
 * cuentas, ni la caja): un aviso neutro. La cinta sí queda (hora y estado del guardado, sin datos del club: hace falta
 * para «Usar acá» y para avisar «sin base»), y el bloqueo de la sesión del club (pieza global) encima. Así el
 * resguardo no depende de que el chunk del bloqueo ya haya bajado. En la demo siempre hay operador de ejemplo.
 * Se suscribe sólo al operador: si cambia quién opera, los hijos son los mismos elementos y React no los repinta.
 */
// ── qué solapas se ven ──
// En la jornada real las de dueño (`soloDuenos`) las decide QUIEN OPERA (el del PIN: rol `duenio`, el que tiene los
// permisos de dueño en el motor, como las pestañas del vanilla con `puede`), no el login del puesto. En la demo, el
// rol del ERP, como siempre. Son dos listas fijas: el snapshot es estable y sólo cambia si cambia «es dueño».
type SolapaVisible = { id: Solapa; etiqueta: string };
const CON_DUENOS: readonly SolapaVisible[] = [...SOLAPAS_DE_FABRICA, ...extras];
const SIN_DUENOS: readonly SolapaVisible[] = extras.some((e) => e.soloDuenos) ? [...SOLAPAS_DE_FABRICA, ...extras.filter((e) => !e.soloDuenos)] : CON_DUENOS;
const solapasVisibles = (almacen: Almacen) => (esDuenoQuienMira(almacen) ? CON_DUENOS : SIN_DUENOS);
/** Las solapas que ve quien opera ahora. Repinta sólo a quien la usa, y sólo cuando cambia «es dueño». */
function useSolapasVisibles(almacen: Almacen): readonly SolapaVisible[] {
  const leer = useCallback(() => solapasVisibles(almacen), [almacen]);
  return useSyncExternalStore(almacen.suscribirOperador, leer, leer);
}

/** La tira de solapas: chica y suscripta al operador, así cambiar de operador no repinta la recepción. */
function TiraDeSolapas({
  almacen,
  solapa,
  onCambiar,
  botones,
}: {
  almacen: Almacen;
  solapa: Solapa;
  onCambiar: (s: Solapa) => void;
  botones: React.RefObject<Partial<Record<Solapa, HTMLButtonElement | null>>>;
}) {
  const visibles = useSolapasVisibles(almacen);
  const esta = visibles.some((s) => s.id === solapa);
  // La solapa elegida dejó de estar (entró alguien que no es dueño): se pasa a la agenda.
  useEffect(() => {
    if (!esta) onCambiar("agenda");
  }, [esta, onCambiar]);
  // Hasta 5 a la vista y el resto en «Más», como el club de hoy (tira-de-solapas-core.ts).
  const tira = armarTira(visibles, solapa);
  const enFila = tira.elegidaDeMas ? [...tira.principales, tira.elegidaDeMas] : tira.principales;
  // Solapas con flechas (patrón de tablist): ←/→ cambian y llevan el foco (entre las que están a la vista).
  const alTeclear = (e: React.KeyboardEvent) => {
    const i = enFila.findIndex((s) => s.id === solapa);
    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!paso || i < 0) return;
    e.preventDefault();
    const sig = enFila[(i + paso + enFila.length) % enFila.length].id;
    onCambiar(sig);
    botones.current[sig]?.focus();
  };
  return (
    <div className="flex items-end border-b border-line">
      <div role="tablist" aria-label="Recepción del club" onKeyDown={alTeclear} className="flex min-w-0 flex-wrap">
        {enFila.map((s) => (
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
            onClick={() => onCambiar(s.id)}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 text-sm focus-visible:outline-2 focus-visible:outline-focus",
              solapa === s.id ? "border-accent font-semibold text-strong" : "border-transparent text-muted hover:text-strong",
            )}
          >
            {s.etiqueta}
          </button>
        ))}
      </div>
      {tira.mas.length > 0 && <MenuMas opciones={tira.mas} onElegir={onCambiar} />}
    </div>
  );
}

/** «Más»: el resto de las solapas en un menú (Escape o un clic afuera lo cierran y el foco vuelve al botón). */
function MenuMas({ opciones, onElegir }: { opciones: readonly SolapaVisible[]; onElegir: (s: Solapa) => void }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!abierto) return;
    caja.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const afuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", afuera);
    return () => document.removeEventListener("pointerdown", afuera);
  }, [abierto]);
  const cerrar = () => {
    setAbierto(false);
    boton.current?.focus();
  };
  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cerrar();
      return;
    }
    const paso = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const items = [...(caja.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + paso + items.length) % items.length]?.focus();
  };
  return (
    <div ref={caja} className="relative -mb-px" onKeyDown={alTeclear}>
      <button
        ref={boton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        onClick={() => setAbierto((a) => !a)}
        className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap border-b-2 border-transparent px-4 text-sm text-muted hover:text-strong focus-visible:outline-2 focus-visible:outline-focus"
      >
        Más <span aria-hidden="true">▾</span>
      </button>
      {abierto && (
        <div id={id} role="menu" aria-label="Más solapas" className="absolute right-0 z-40 mt-1 flex min-w-52 flex-col rounded-lg border border-line bg-surface-raised p-1 shadow-overlay">
          {opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                onElegir(o.id);
              }}
              className="min-h-11 rounded-md px-3 text-left text-sm text-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus"
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Los accesos de la agenda, como los botones del club de hoy al lado de «+ Turno»: la lista de espera y el
 * mantenimiento a un toque, sin buscarlos en «Más». Sólo los que quien opera puede abrir.
 */
function AccesosDeLaAgenda({ almacen, onIr }: { almacen: Almacen; onIr: (s: Solapa) => void }) {
  const visibles = useSolapasVisibles(almacen);
  const accesos = [
    { id: "buffet", texto: "Abrir cuenta" },
    { id: "fijos", texto: "Lista de espera y fijos" },
    { id: "canchas", texto: "Mantenimiento y lluvia" },
  ].filter((a) => visibles.some((s) => s.id === a.id));
  if (!accesos.length) return null;
  return (
    <div data-agenda="accesos" className="my-2 flex flex-wrap gap-2">
      {accesos.map((a) => (
        <Button key={a.id} variant="ghost" size="md" onClick={() => onIr(a.id)}>
          {a.texto}
        </Button>
      ))}
    </div>
  );
}

/** Monta el panel de una solapa sólo si quien opera la puede ver. */
function SiSeVe({ almacen, id, children }: { almacen: Almacen; id: Solapa; children: React.ReactNode }) {
  const visibles = useSolapasVisibles(almacen);
  return visibles.some((s) => s.id === id) ? children : null;
}

const sinConfigurar = (e: EstadoClub) => e.config.configurado === false;
const igualQue = (_: boolean | undefined, nuevo: boolean) => nuevo;
const sinTurno = () => undefined;
const consola = extras.find((e) => e.id === "configuracion") ?? null;

function SoloConOperador({ almacen, negocio, children }: { almacen: Almacen; negocio: string; children: React.ReactNode }) {
  const operador = useOperador(almacen);
  const primerArranque = useSeleccion(almacen, sinConfigurar, igualQue);
  if (almacen.modo() === "real" && !operador && primerArranque) {
    // La jornada real recién abierta: los dueños todavía no tienen PIN, así que nadie puede entrar. Se ve SÓLO la
    // consola de arranque (la solapa «configuracion»: arma los PIN con `almacen.arranque`), nada más del club.
    if (!consola || (consola.soloDuenos && almacen.rol() !== "OWNER")) {
      return (
        <section role="status" aria-label="Configuración inicial pendiente" className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface-raised p-6 text-center">
          <p className="text-lg font-semibold text-strong">Falta la configuración inicial</p>
          <p className="text-sm text-body">La arma un dueño del club: entrá con un usuario dueño del panel.</p>
        </section>
      );
    }
    return (
      <div role="region" aria-label="Configuración inicial del club">
        <Suspense fallback={<SolapaCargando />}>
          <consola.diferida.Solapa almacen={almacen} dia={almacen.ahora().fecha} rol={almacen.rol()} onVerTurno={sinTurno} irASolapa={sinTurno} negocio={negocio} />
        </Suspense>
      </div>
    );
  }
  if (almacen.modo() === "real" && !operador) {
    return (
      <section role="status" aria-label="Recepción bloqueada" className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface-raised p-6 text-center">
        <p className="text-lg font-semibold text-strong">Bloqueado</p>
        <p className="text-sm text-body">Entrá con tu PIN para ver y operar el club.</p>
      </section>
    );
  }
  return children;
}

type Panel = { tipo: "cuenta"; id: string } | { tipo: "alta"; canchaId: string; inicio: number | null } | null;

const elDia = (_: EstadoClub, a: Ahora) => a.fecha;
const elNuevo = (_: string | undefined, nuevo: string) => nuevo;

export interface PropsDeClubDemo {
  negocio: string;
  usuario: string;
  rol: RolDelPanel;
  /** "demo" (default) o "real". Hoy nadie pasa "real": lo decide el día de corte (page.tsx). */
  reloj?: "demo" | "real";
  /** Dónde se guarda (default: este equipo). Gana sobre `base` (los tests lo pasan a mano). */
  guardado?: GuardadoDelClub;
  /**
   * La base del ERP (las acciones del servidor, estado-actions.ts). En la jornada real, el club se guarda ahí y este
   * equipo queda de espejo (el del almacén: el adaptador va SIN espejo propio, si no serían dos copias de ~3 MB en el
   * mismo localStorage, que tiene ~5).
   */
  base?: PuertaDeLaBase;
}

export default function ClubDemo({ negocio, usuario, rol, reloj = "demo", guardado, base }: PropsDeClubDemo) {
  const [enLaBase] = useState(() => (reloj === "real" && !guardado && base ? crearGuardadoEnLaBase({ negocio, base, espejo: null }) : null));
  const [almacen] = useState(() =>
    reloj === "real"
      ? crearAlmacen({ reloj, clave: claveDeLaJornada(negocio), candado: candadoDeLaJornada(negocio), almacenamiento: guardadoDelEquipo(), guardado: guardado ?? enLaBase ?? undefined, rol })
      : crearAlmacen({ hoy: fechaLocal(new Date()), clave: claveDeLaDemo(negocio, usuario), almacenamiento: guardadoDelEquipo(), guardado, rol }),
  );
  // Mientras el club no está configurado (jornada real recién abierta), la recepción abre en Configuración: ahí sigue
  // el dueño después de armar su PIN en la consola de arranque. Si lo guardado llega después y no está configurado,
  // también se pasa ahí (una vez, al cambiar; después se mueve libre).
  const sinConfig = useSeleccion(almacen, sinConfigurar, igualQue);
  // (Si quien entra no es dueño, la tira la pasa a la agenda.)
  const abreEnConfiguracion = almacen.modo() === "real" && sinConfig && CON_DUENOS.some((s) => s.id === "configuracion");
  const [solapa, setSolapa] = useState<Solapa>(() => (abreEnConfiguracion ? "configuracion" : "agenda"));
  const [sinConfigVisto, setSinConfigVisto] = useState(sinConfig);
  if (sinConfigVisto !== sinConfig) {
    setSinConfigVisto(sinConfig);
    if (abreEnConfiguracion) setSolapa("configuracion");
  }
  const [panel, setPanel] = useState<Panel>(null);
  // El día de hoy sigue al reloj (en la jornada real cambia a la medianoche del club); el string no cambia en cada
  // minuto, así que esto no repinta la recepción por el latido.
  const hoy = useSeleccion(almacen, elDia, elNuevo);
  const [dia, setDia] = useState(hoy);
  const [hoyVisto, setHoyVisto] = useState(hoy);
  if (hoyVisto !== hoy) {
    // Cambió el día: si se miraba hoy, se pasa al nuevo hoy (como el vanilla con VISTA).
    setHoyVisto(hoy);
    if (dia === hoyVisto) setDia(hoy);
  }
  const botones = useRef<Partial<Record<Solapa, HTMLButtonElement | null>>>({});

  // Lo que corre solo: el latido del reloj real, el candado de la jornada y abrir lo guardado.
  useEffect(() => almacen.arrancar(), [almacen]);

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

  // Lo pendiente de guardar se escribe al salir de la página o al pasar a otra app; al volver, el reloj late ya.
  useEffect(() => {
    const guardar = () => almacen.guardarYa();
    const latir = () => almacen.latir();
    const alCambiarVista = () => {
      if (document.visibilityState === "hidden") guardar();
      else latir();
    };
    window.addEventListener("pagehide", guardar);
    window.addEventListener("pageshow", latir);
    document.addEventListener("visibilitychange", alCambiarVista);
    return () => {
      window.removeEventListener("pagehide", guardar);
      window.removeEventListener("pageshow", latir);
      document.removeEventListener("visibilitychange", alCambiarVista);
      guardar();
    };
  }, [almacen]);
  // Al ocultar la pestaña o salir, lo pendiente sube a la base en el acto. Va DESPUÉS del efecto de arriba (los
  // oyentes corren en el orden en que se engancharon): primero el almacén entrega lo último, después sale la subida.
  useEffect(() => enLaBase?.engancharSalida(), [enLaBase]);

  const volverALaDemo = useCallback(() => {
    almacen.volverALaDemo();
    setPanel(null);
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

  // Para las piezas globales (solapas-club.ts): ir a una solapa es lo mismo que tocarla; una que quien opera no ve, nada.
  // Se mira la lista de AHORA (la del operador actual), en el momento del clic: ClubDemo no se suscribe al operador.
  const irASolapa = useCallback(
    (id: string) => {
      if (solapasVisibles(almacen).some((s) => s.id === id)) cambiarSolapa(id);
    },
    [almacen, cambiarSolapa],
  );

  // Para la bandeja: lo mismo, pero dice si la solapa estaba (si no, la bandeja le explica a quien opera qué hacer).
  const irASolapaSiEsta = useCallback(
    (id: string) => {
      if (!solapasVisibles(almacen).some((s) => s.id === id)) return false;
      cambiarSolapa(id);
      return true;
    },
    [almacen, cambiarSolapa],
  );

  // El atajo de la cinta cuando lo guardado se llena: archivar es de un dueño.
  const irAArchivar = useCallback(() => {
    if (!irASolapaSiEsta("configuracion")) almacen.informar({ ok: false, mensaje: "Archivar los días cerrados lo hace un dueño: avisale para que entre con su PIN." });
  }, [almacen, irASolapaSiEsta]);

  const [paleta, setPaleta] = useState(false);
  // Nuevo turno (tecla N o la paleta): el alta en la primera cancha habilitada, desde la primera hora libre.
  const nuevoTurno = useCallback(() => {
    const canchas = almacen.estado().canchas;
    const libre = canchas.find((c) => c.estado !== "mantenimiento") ?? canchas[0];
    if (!libre) return;
    cambiarSolapa("agenda");
    setPanel({ tipo: "alta", canchaId: libre.id, inicio: null });
  }, [almacen, cambiarSolapa]);

  // «Abrir cuenta» (acceso de la agenda o tecla C): a Buffet y directo al formulario, que está al final (la solapa se
  // carga diferida: se espera a que aparezca, unos cuadros).
  const abrirCuenta = useCallback(() => {
    cambiarSolapa("buffet");
    let vueltas = 0;
    const buscar = () => {
      const f = document.querySelector<HTMLElement>('[data-ui="abrir-cuenta"]');
      if (f) {
        f.scrollIntoView({ block: "center" });
        f.querySelector<HTMLElement>("input, select, button")?.focus();
      } else if (vueltas++ < 30) requestAnimationFrame(buscar);
    };
    requestAnimationFrame(buscar);
  }, [cambiarSolapa]);

  // Los atajos del club de hoy (app.mjs, «atajos de teclado»): N turno nuevo, C abrir cuenta (Buffet), T volver a
  // hoy, ←/→ día anterior o siguiente en la agenda, 1–9 las solapas en su orden. Nunca mientras se escribe, con una
  // ventana abierta, con Ctrl/⌘/Alt, ni con la pantalla bloqueada (L, bloquear, ya lo atiende el bloqueo).
  useEffect(() => {
    const alTeclear = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (ev.defaultPrevented) return;
      // Ctrl/⌘+K abre o cierra la paleta desde cualquier lado (también escribiendo), salvo con el club bloqueado.
      if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && ev.key.toLowerCase() === "k") {
        if (almacen.modo() === "real" && !almacen.operador()) return;
        ev.preventDefault();
        setPaleta((p) => !p);
        return;
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (t && (t.matches("input, select, textarea") || t.isContentEditable)) return;
      if (document.querySelector("dialog[open], [role=dialog]:not([popover]), [popover]:popover-open, [role=alertdialog], [role=menu]")) return;
      if (almacen.modo() === "real" && !almacen.operador()) return;
      const k = ev.key;
      const visibles = solapasVisibles(almacen);
      const orden = (() => {
        const tira = armarTira(visibles, "");
        return [...tira.principales, ...tira.mas];
      })();
      let hizo = true;
      if (k === "/") setPaleta(true);
      else if (k === "n" || k === "N") nuevoTurno(); else if ((k === "c" || k === "C") && visibles.some((s) => s.id === "buffet")) abrirCuenta();
      else if (k === "t" || k === "T") {
        cambiarSolapa("agenda");
        elegirDia(hoy);
      } else if ((k === "ArrowLeft" || k === "ArrowRight") && solapa === "agenda" && !t?.closest("[data-celda], [data-agenda='dias'], [role=tablist]")) {
        const d = sumarDias(dia, k === "ArrowLeft" ? -1 : 1);
        if (d >= sumarDias(hoy, -1) && d <= sumarDias(hoy, 5)) elegirDia(d);
        else hizo = false;
      } else if (/^[1-9]$/.test(k) && orden[Number(k) - 1]) cambiarSolapa(orden[Number(k) - 1].id);
      else hizo = false;
      if (hizo) ev.preventDefault();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [almacen, abrirCuenta, nuevoTurno, cambiarSolapa, elegirDia, hoy, dia, solapa]);

  // Lo elegido en la paleta.
  const hacerDeLaPaleta = useCallback(
    (a: AccionPaleta) => {
      if (a.tipo === "solapa") irASolapa(a.id);
      else if (a.tipo === "hoy") {
        cambiarSolapa("agenda");
        elegirDia(hoy);
      } else if (a.tipo === "nuevoTurno") nuevoTurno();
      else if (a.tipo === "abrirCuenta") abrirCuenta();
      else if (a.tipo === "turno") verTurno(a.id);
      else if (a.tipo === "cliente") {
        pedirFichaDeCliente(a.id);
        irASolapa("clientes");
      }
    },
    [abrirCuenta, cambiarSolapa, elegirDia, hoy, irASolapa, nuevoTurno, verTurno],
  );

  // Al cambiar quien opera, la cuenta (o el alta) que tenía abierta la persona anterior se cierra (como el vanilla).
  // Sin suscribir a ClubDemo al operador: si no había nada abierto, `setPanel(null)` no repinta.
  useEffect(() => almacen.suscribirOperador(() => setPanel(null)), [almacen]);

  return (
    // El negocio a mano para el aviso al dueño (pedido-del-duenio.tsx, la ficha del cliente): aprobador-externo.ts.
    <NegocioDelClub value={negocio}>
    <div className="flex flex-col gap-4">
      {piezas.map((p) => (
        <Suspense key={p.id} fallback={null}>
          <p.diferida.Solapa almacen={almacen} rol={rol} irASolapa={irASolapa} negocio={negocio} />
        </Suspense>
      ))}

      <CintaDelClub
        almacen={almacen}
        onVolverALaDemo={volverALaDemo}
        onIrAArchivar={CON_DUENOS.some((s) => s.id === "configuracion") ? irAArchivar : undefined}
      />

      <SoloConOperador almacen={almacen} negocio={negocio}>

      <TiraDeSolapas almacen={almacen} solapa={solapa} onCambiar={cambiarSolapa} botones={botones} />

      <div role="tabpanel" id={`club-panel-${solapa}`} aria-labelledby={`club-solapa-${solapa}`}>
        {solapa === "agenda" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div data-pantalla-tarjeta className="flex min-w-0 flex-col gap-3">
              <AgendaCanchas
                almacen={almacen}
                dia={dia}
                abierto={abiertoId}
                onAbrir={onAbrir}
                onReservar={onReservar}
                dias={<DiasDeLaAgenda hoy={hoy} dia={dia} onDia={elegirDia} />}
                accesos={<AccesosDeLaAgenda almacen={almacen} onIr={(s) => (s === "buffet" ? abrirCuenta() : irASolapa(s))} />}
              />
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
                <div className="flex flex-col gap-3">
                  <BandejaDelClub almacen={almacen} onVerTurno={verTurno} irASolapa={irASolapaSiEsta} />
                  <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">
                    Tocá un turno de la agenda para ver su cuenta: la cancha y los cargos de cada jugador, y cobrar. Tocá un hueco libre o «+ Turno» para dar un turno.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        {solapa !== "agenda" && (
          <Suspense fallback={<SolapaCargando />}>
            {solapa === "fijos" && <FijosYEspera almacen={almacen} onVerTurno={verTurno} />}
            {solapa === "canchas" && <CanchasDelClub almacen={almacen} dia={dia} />}
            {solapa === "buffet" && <BuffetDelClub almacen={almacen} onVerTurno={verTurno} negocio={negocio} />}
            {solapa === "caja" && <CajaDelClub almacen={almacen} negocio={negocio} />}
            {solapa === "tienda" && <TiendaDelClub almacen={almacen} />}
            {extras.map((e) =>
              solapa === e.id ? (
                <SiSeVe key={e.id} almacen={almacen} id={e.id}>
                  <e.diferida.Solapa almacen={almacen} dia={dia} rol={rol} onVerTurno={verTurno} irASolapa={irASolapa} negocio={negocio} />
                </SiSeVe>
              ) : null,
            )}
          </Suspense>
        )}
      </div>

      <AvisosDelClub almacen={almacen} />
      {paleta && (
        <PaletaDelClub
          almacen={almacen}
          hoy={hoy}
          dia={dia}
          solapas={(() => {
            const tira = armarTira(solapasVisibles(almacen), "");
            return [...tira.principales, ...tira.mas];
          })()}
          onElegir={hacerDeLaPaleta}
          onCerrar={() => setPaleta(false)}
        />
      )}
      </SoloConOperador>
    </div>
    </NegocioDelClub>
  );
}
