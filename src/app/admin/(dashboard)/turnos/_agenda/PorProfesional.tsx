"use client";

// ============================================================================
// LA PLANILLA DEL DÍA — por profesional o por box, con huecos que se tocan y turnos que se arrastran.
// ============================================================================
//
// La lista del día contesta «¿quién sigue?»; esta vista contesta «¿dónde hay un hueco?»: una
// columna por profesional (con su box) o por box (con quiénes atienden ahí), la hora a la izquierda
// cada media hora, y cada turno como un tramo con la hora, la clienta y su marca de estado (forma +
// palabra, nunca sólo color). La comparten la agenda nueva (LibroDelDia) y la de siempre en la PC
// (CalendarGrid), siempre adentro de la mesa (`MesaDeTurnos`): tocar un tramo abre el cajón del turno
// a la derecha, sin mover la grilla.
//
//   · HUECO: una media hora libre, que no pasó, de alguien que no está bloqueada → un toque abre
//     «Dar turno» con la profesional, el día y la hora puestos (`hrefNuevoTurnoEnHueco`, grilla.ts).
//   · ARRASTRAR (PC, mouse): se suelta en otra hora u otra profesional → «¿Mover a jue 24 16:30 con
//     Caro?» [Mover y avisar por WhatsApp] [Mover sin avisar] [No]. Mientras se arrastra, la celda
//     de destino dice si entra (los huecos libres del servidor, sin contar el propio turno); si no
//     entra, no se suelta y se lee por qué. En el celular se mueve desde el cajón (⋯ → Mover).
//   · Ver por: Profesional | Box (`?por=box`); los turnos que se pisan van uno al lado del otro y,
//     si están vivos, con la marca «Se pisa con otro turno» (por box: dos en el mismo box).
//   · Chips (`?ver=`): atenúan lo que no entra en el filtro, sin ir al servidor.
//   · La raya de «ahora» cruza la planilla a la hora justa (sólo hoy).
//   · Prendida la agenda interactiva, la BARRA de un toque (No vino · Cobrar · WhatsApp) flota sobre
//     el turno: en la PC con el mouse encima o el foco del teclado; en táctil, el 1.er toque elige el
//     turno y la muestra con «Abrir». Tocar fuera o Esc la cierra (`seleccionDeLaBarra`, barra-core).
//   · Prendida (T2, AGENDA-INTERACCION.md §2.2/§2.3/§2.8): soltar = mover SIN hoja y aviso de 8 s
//     «Movido a 17:00 con Caro · Avisar por WhatsApp · Deshacer»; en táctil, mantener 300 ms levanta
//     el turno; la manija del borde de abajo lo estira de a 15' (`cambiarDuracionDelTurno`); con el
//     teclado, M levanta, flechas, Enter suelta, Esc cancela, Shift+↑↓ estira (se guarda al soltar
//     Shift). Lo que se anticipa es `veredictoDelDestino` / `veredictoDeDuracion`; la verdad, el servidor.
//
// En el celular la planilla se desliza de costado dentro de su marco (la hora queda fija a la
// izquierda); la página no.

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as KeyboardEventDeReact } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Chip, Marca, Segmented } from "@/components/ui";
import { businessWallTimeToUtc, dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import { huecosParaMover } from "@/lib/turnos/mover-actions";
import { cambiarDuracionDelTurno } from "@/lib/turnos/duracion-actions";
import { rescheduleAppointment } from "@/lib/actions";
import { BUFFER_MIN } from "@/lib/business-config";
import { esRedireccionDeNext } from "../errores";
import { FILTROS_AGENDA, entraEnFiltro, leerFiltroAgenda, marcaDelTurno, textoSeniaPedida, textosAvisoMP, type TurnoDelDia } from "../agenda-core";
import {
  LEYENDA_DE_LA_GRILLA,
  PASO_MIN,
  CARRILES_EN_EL_CELULAR,
  CARRILES_EN_LA_PC,
  anchoDeLaColumna,
  carrilesConTope,
  carrilesDeLaColumna,
  columnaUnica,
  esTurnoCorto,
  lineaDelTurno,
  tituloDelTurno,
  columnaDelTurno,
  columnasDeLaGrilla,
  enMinutos,
  estadoDeLaCelda,
  horaDeMinuto,
  horasDeLaGrilla,
  leerVerPor,
  minutosDelDia,
  rayaDeAhora,
  FUERA_DE_HORARIO,
  NO_TRABAJA_ESE_DIA,
  ausenciaDeLaColumna,
  type BloqueoDelDia,
  type ColumnaDeLaGrilla,
} from "../grilla";
import { useMesa } from "./MesaDeTurnos";
import BarraDelTurno from "./BarraDelTurno";
import { SIN_SELECCION, hayBarra, ladoDeLaBarra, seleccionDeLaBarra, teclasDeLaBarra, vistaDeLaBarra, type EventoDeLaBarra, type SeleccionDeLaBarra } from "./barra-core";
import { ConfirmarMover, enlaceAvisoMover, useMoverTurno } from "./MoverTurno";
import { AvisoDeshacerCambio, type CambioParaDeshacer } from "./Deshacer";
import {
  PASO_DURACION_MIN,
  destinoDelArrastre,
  destinoPorTeclado,
  finEstirado,
  rotuloDeDuracion,
  sePuedeMover,
  textoMovido,
  veredictoDeDuracion,
  veredictoDelDestino,
  type Destino,
  type TeclaDeMover,
  type VeredictoDelDestino,
} from "./mover-core";

/** Lo que sabe la planilla del servidor para validar el arrastre de UN turno. */
type Consulta = { turnoId: string; hacen: Set<string> | null; nombres: Map<string, string>; huecos: Record<string, string[]> | null; error?: string };

type Arrastre = { id: string; x0: number; y0: number; activo: boolean; tactil?: boolean };

/** Distancia mínima (px) para que un apretar-y-mover sea arrastre y no un toque. */
const UMBRAL_ARRASTRE = 6;
/** Táctil (prendida): mantener apretado este tiempo levanta el turno (antes, el dedo desliza la grilla). */
const PULSACION_MS = 300;
const NO_RESPONDIO = "No volvió respuesta del servidor. Recargá la agenda y fijate cómo quedó el turno.";

/** Estirar con la manija (o con Shift+↑↓): el fin que se está mostrando. */
type Estirando = { id: string; fin: string; via: "puntero" | "teclado" };

export default function PorProfesional({
  turnos: todosLosTurnos,
  profesionales,
  ahora,
  dia,
  bloqueos = [],
  soloProfesional = null,
}: {
  turnos: TurnoDelDia[];
  profesionales: { id: string; nombre: string; box: string | null }[];
  ahora: string;
  /** El día que se mira ("YYYY-MM-DD", hora del negocio). */
  dia: string;
  /** Francos y ausencias del día (sus celdas no se ofrecen como hueco). */
  bloqueos?: BloqueoDelDia[];
  /**
   * Agenda interactiva en el celular: la grilla de UNA profesional (su id). Sólo cuenta con
   * `permisos.interaccion`; apagado, la planilla de siempre.
   */
  soloProfesional?: string | null;
}) {
  const { permisos, abrir, cambiarUrl, reloj: relojDeLaMesa } = useMesa();
  const params = useSearchParams();
  // Agenda interactiva (AGENDA-INTERACCION.md §2.1 y §2.7): apagada, todo como antes.
  const interaccion = permisos.interaccion === true;
  const solo = interaccion ? soloProfesional : null;
  const verPor = solo ? "profesional" : leerVerPor(params.get("por"));
  const filtro = leerFiltroAgenda(params.get("ver"));
  const reloj = new Date(ahora);
  const hoy = dateStrInBusinessTz(reloj);
  const ahoraMin = minutosDelDia(reloj);

  const todasLasColumnas = columnasDeLaGrilla(verPor, profesionales, todosLosTurnos);
  const columnas = solo ? columnaUnica(todasLasColumnas, solo) : todasLasColumnas;
  // Con una sola profesional a la vista, los chips cuentan y la grilla se estira con lo suyo.
  const turnos = solo ? todosLosTurnos.filter((t) => t.profesionalId === (columnas[0]?.clave ?? solo)) : todosLosTurnos;
  const nombreDe = (id: string) => profesionales.find((p) => p.id === id)?.nombre;
  const horas = horasDeLaGrilla(turnos.map(enMinutos));
  const desde = horas.desde * 60;
  const hasta = horas.hasta * 60;
  const filas = Math.max(1, (hasta - desde) / PASO_MIN);
  const raya = rayaDeAhora({ dia, hoy, ahoraMin, desde, hasta });

  const porColumna = new Map<string, TurnoDelDia[]>();
  for (const t of turnos) {
    const clave = columnaDelTurno(verPor, t);
    porColumna.set(clave, [...(porColumna.get(clave) ?? []), t]);
  }

  // ── Arrastrar para mover ──
  const arrastre = useRef<Arrastre | null>(null);
  const recienSoltado = useRef(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<{ columna: string; minuto: number } | null>(null);
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [aviso, setAviso] = useState("");
  const [aConfirmar, setAConfirmar] = useState<{ turnoId: string; destino: Destino } | null>(null);

  // ── Agenda interactiva (T2): mover sin hoja, estirar, teclado y táctil ──
  const { mover: moverSinHoja } = useMoverTurno({ silencioso: true, conservarDuracion: true });
  const [cambio, setCambio] = useState<CambioParaDeshacer | null>(null);
  const moviendo = useRef(false);
  const levantadoConTeclado = useRef<string | null>(null);
  const pulsacion = useRef<number | null>(null);
  const [estirando, setEstirando] = useState<Estirando | null>(null);
  const manija = useRef<{ id: string; y0: number; fin0: string; fin: string; pxPorPaso: number } | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [arrastreTactil, setArrastreTactil] = useState(false);
  const topeDelDia = new Date(businessWallTimeToUtc(dia, "00:00").getTime() + hasta * 60_000).toISOString();

  // ── La barra sobre el turno (sólo prendida) ──
  const [seleccion, setSeleccion] = useState<SeleccionDeLaBarra>(SIN_SELECCION);
  const ultimoPuntero = useRef<string | null>(null);
  const alBarra = (e: EventoDeLaBarra) => {
    const r = seleccionDeLaBarra(seleccion, e);
    setSeleccion(r.seleccion);
    if (r.abrirCajon) abrir(r.abrirCajon);
  };
  useEffect(() => {
    if (!seleccion.elegido) return;
    const elegido = seleccion.elegido;
    const alTocar = (e: PointerEvent) => {
      const dueño = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-turno-barra]");
      if (dueño?.dataset.turnoBarra !== elegido) setSeleccion((s) => seleccionDeLaBarra(s, { tipo: "fuera" }).seleccion);
    };
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSeleccion((s) => seleccionDeLaBarra(s, { tipo: "escape", id: null }).seleccion);
    };
    document.addEventListener("pointerdown", alTocar, true);
    window.addEventListener("keydown", alPresionar);
    return () => {
      document.removeEventListener("pointerdown", alTocar, true);
      window.removeEventListener("keydown", alPresionar);
    };
  }, [seleccion.elegido]);

  const cancelar = () => {
    arrastre.current = null;
    setArrastrando(null);
    setSobre(null);
    if (interaccion) {
      setArrastreTactil(false);
      levantadoConTeclado.current = null;
      if (pulsacion.current !== null) window.clearTimeout(pulsacion.current);
      pulsacion.current = null;
    }
  };

  // Táctil: con el turno levantado, el dedo lo lleva y la grilla no se desliza.
  useEffect(() => {
    if (!arrastreTactil) return;
    const quieto = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", quieto, { passive: false });
    return () => document.removeEventListener("touchmove", quieto);
  }, [arrastreTactil]);

  useEffect(() => {
    if (!arrastrando) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelar();
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
    // `cancelar` sólo toca refs y setters (y `interaccion`, fijo durante el arrastre): no hace falta re-suscribir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastrando]);

  const consultar = (turnoId: string) => {
    if (consulta?.turnoId === turnoId && !consulta.error) return;
    setConsulta({ turnoId, hacen: null, nombres: new Map(), huecos: null });
    void huecosParaMover(turnoId, [dia], null)
      .then((r) =>
        setConsulta((c) => {
          if (c?.turnoId !== turnoId) return c;
          if (!r.ok) return { ...c, error: r.error };
          const huecos: Record<string, string[]> = {};
          for (const [id, porDia] of Object.entries(r.huecos)) huecos[id] = porDia[dia] ?? [];
          return { turnoId, hacen: new Set(r.profesionales.map((p) => p.id)), nombres: new Map(r.profesionales.map((p) => [p.id, p.nombre])), huecos };
        }),
      )
      .catch(() => setConsulta((c) => (c?.turnoId === turnoId ? { ...c, error: "No pude fijarme si está libre. Probá de nuevo." } : c)));
  };

  const destinoDe = (t: TurnoDelDia, celda: { columna: string; minuto: number }): { destino: Destino | null; veredicto: VeredictoDelDestino } => {
    const columna = columnas.find((c) => c.clave === celda.columna);
    const profesionalId = columna ? destinoDelArrastre(columna, t) : null;
    if (!columna || !profesionalId) {
      return { destino: null, veredicto: { tipo: "no", motivo: "En ese box atiende más de una: movelo desde la vista por profesional o desde el turno." } };
    }
    const destino: Destino = {
      profesionalId,
      profesional: consulta?.nombres.get(profesionalId) ?? nombreDe(profesionalId) ?? columna.titulo,
      inicio: businessWallTimeToUtc(dia, horaDeMinuto(celda.minuto)).toISOString(),
    };
    if (consulta?.turnoId === t.id && consulta.error) return { destino, veredicto: { tipo: "no", motivo: consulta.error } };
    const deEste = consulta?.turnoId === t.id ? consulta : null;
    return {
      destino,
      veredicto: veredictoDelDestino({ turno: t, destino, ahora: new Date(), hacen: deEste?.hacen ?? null, huecos: deEste?.huecos ? (deEste.huecos[profesionalId] ?? []) : undefined }),
    };
  };

  const celdaBajo = (x: number, y: number): { columna: string; minuto: number } | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const c = (el as HTMLElement).closest?.<HTMLElement>("[data-celda]");
      if (c?.dataset.columna && c.dataset.minuto) return { columna: c.dataset.columna, minuto: Number(c.dataset.minuto) };
    }
    return null;
  };

  const soltar = (t: TurnoDelDia, celda: { columna: string; minuto: number } | null) => {
    cancelar();
    if (!celda) return;
    const { destino, veredicto } = destinoDe(t, celda);
    if (veredicto.tipo === "ok" && destino) {
      setAviso("");
      if (interaccion) void moverDirecto(t, destino);
      else setAConfirmar({ turnoId: t.id, destino });
    } else if (veredicto.tipo === "no") setAviso(`No se movió ${t.clienta}: ${veredicto.motivo}`);
    else if (veredicto.tipo === "buscando") setAviso("Todavía me estaba fijando si ese horario está libre: soltalo de nuevo en un segundo.");
  };

  /** Prendida: soltar = mover (sin hoja) y el aviso con Deshacer. Un segundo drop mientras va, no. */
  const moverDirecto = async (t: TurnoDelDia, destino: Destino) => {
    if (moviendo.current) return;
    moviendo.current = true;
    const origen = { profesionalId: t.profesionalId, inicio: t.inicio };
    const r = await moverSinHoja(t, destino, false).finally(() => {
      moviendo.current = false;
    });
    if (!r.ok) {
      setAviso(`No se movió ${t.clienta}: ${r.error}`);
      setAnuncio(`No se movió ${t.clienta}: ${r.error}`);
      return;
    }
    const wa = enlaceAvisoMover(t, destino);
    const texto = textoMovido(destino, dia);
    setAnuncio(`${texto}. Podés deshacerlo en el aviso.`);
    setCambio({
      clave: `mover-${t.id}-${destino.profesionalId}-${destino.inicio}`,
      que: "mover",
      // Una línea: el texto se corta con «…» (entero en el title) y la acción queda a la derecha, ≥ 44 px.
      mensaje: (
        <span className="-my-2 flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate" title={texto}>
            {texto}
          </span>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded px-2 font-semibold underline underline-offset-2"
            >
              {/* En el celular se ve «WhatsApp»; el nombre accesible sigue entero. */}
              <span className="max-sm:sr-only">Avisar por&nbsp;</span>WhatsApp
            </a>
          )}
        </span>
      ),
      listo: `Listo: ${t.clienta} volvió a las ${fmtTime(t.inicio)} con ${t.profesional}.`,
      deshacer: async () => {
        const fd = new FormData();
        fd.set("appointmentId", t.id);
        fd.set("startsAt", origen.inicio);
        fd.set("professionalId", origen.profesionalId);
        fd.set("conservarDuracion", "1");
        try {
          const v = await rescheduleAppointment(fd);
          return v.ok ? null : v.error;
        } catch (err) {
          if (esRedireccionDeNext(err)) throw err;
          return NO_RESPONDIO;
        }
      },
    });
  };

  const llamarDuracion = async (id: string, fin: string): Promise<string | null> => {
    const fd = new FormData();
    fd.set("appointmentId", id);
    fd.set("endsAt", fin);
    try {
      const v = await cambiarDuracionDelTurno(fd);
      return v.ok ? null : v.error;
    } catch (err) {
      if (esRedireccionDeNext(err)) throw err;
      return NO_RESPONDIO;
    }
  };

  const veredictoEstirar = (t: TurnoDelDia, fin: string) =>
    veredictoDeDuracion({
      turno: t,
      finNuevo: fin,
      vecinos: todosLosTurnos.filter((v) => v.profesionalId === t.profesionalId && v.id !== t.id),
      tope: topeDelDia,
      margenMin: BUFFER_MIN,
      ahora: new Date(),
    });

  /** Soltar la manija (o Shift): se guarda si entra; si no, se lee por qué y queda como estaba. */
  const guardarDuracion = async (t: TurnoDelDia, fin: string) => {
    const v = veredictoEstirar(t, fin);
    if (v.tipo === "igual") {
      setEstirando(null);
      return;
    }
    if (v.tipo === "no") {
      setEstirando(null);
      setAviso(`No se cambió la duración de ${t.clienta}: ${v.motivo}`);
      setAnuncio(v.motivo);
      return;
    }
    setAviso("");
    const finAnterior = t.fin;
    const error = await llamarDuracion(t.id, fin);
    setEstirando(null);
    if (error) {
      setAviso(`No se cambió la duración de ${t.clienta}: ${error}`);
      setAnuncio(error);
      return;
    }
    setAnuncio(`${t.clienta}: ahora termina a las ${fmtTime(fin)}. Podés deshacerlo en el aviso.`);
    setCambio({
      clave: `duracion-${t.id}-${fin}`,
      que: "duracion",
      mensaje: `${t.clienta}: ahora termina a las ${fmtTime(fin)}`,
      listo: `Listo: ${t.clienta} vuelve a terminar a las ${fmtTime(finAnterior)}.`,
      deshacer: () => llamarDuracion(t.id, finAnterior),
    });
  };

  /** Teclado (prendida): M levanta, flechas, Enter suelta, Esc cancela; Shift+↑↓ estira. */
  const alTeclado = (e: KeyboardEventDeReact<HTMLButtonElement>, t: TurnoDelDia, ci: number) => {
    const levantado = levantadoConTeclado.current === t.id;
    if (!levantado && (e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      levantadoConTeclado.current = t.id;
      setArrastrando(t.id);
      setSobre({ columna: columnas[ci]?.clave ?? "", minuto: enMinutos(t).desde });
      consultar(t.id);
      setAnuncio(`Levantaste el turno de ${t.clienta}. Flechas para elegir hora o profesional, Enter para soltar, Escape para cancelar.`);
      return;
    }
    if (levantado) {
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        const m = enMinutos(t);
        const actual = sobre ?? { columna: columnas[ci]?.clave ?? "", minuto: m.desde };
        const indice = columnas.findIndex((c) => c.clave === actual.columna);
        const r = destinoPorTeclado({
          minuto: actual.minuto,
          columna: indice < 0 ? ci : indice,
          tecla: e.key as TeclaDeMover,
          columnas: columnas.length,
          desde,
          hasta,
          duracionMin: m.hasta - m.desde,
          paso: PASO_MIN,
        });
        setSobre({ columna: columnas[r.columna]?.clave ?? actual.columna, minuto: r.minuto });
      } else if (e.key === "Enter") {
        e.preventDefault();
        soltar(t, sobre);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelar();
        setAnuncio("Cancelado: el turno quedó donde estaba.");
      } else if (e.key === "Tab") cancelar();
      return;
    }
    if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      e.stopPropagation();
      const actual = estirando?.id === t.id ? estirando.fin : t.fin;
      const fin = finEstirado(t.inicio, actual, e.key === "ArrowDown" ? 1 : -1, topeDelDia);
      setEstirando({ id: t.id, fin, via: "teclado" });
      const v = veredictoEstirar(t, fin);
      setAnuncio(v.tipo === "no" ? v.motivo : `${rotuloDeDuracion(t.inicio, fin)}. Soltá Shift para guardar.`);
    }
  };

  const turnoArrastrado = arrastrando ? turnos.find((t) => t.id === arrastrando) : undefined;
  const sobreActual = turnoArrastrado && sobre ? destinoDe(turnoArrastrado, sobre) : null;
  const turnoAConfirmar = aConfirmar ? (turnos.find((t) => t.id === aConfirmar.turnoId) ?? null) : null;
  const conteo = (f: (typeof FILTROS_AGENDA)[number]["id"]) => turnos.filter((t) => entraEnFiltro(t, f, reloj)).length;

  // Carriles: apagado, todos los que haya (como siempre); prendido, con ancho mínimo y «+N».
  const reparto = new Map(
    columnas.map((c) => {
      const deLaColumna = porColumna.get(c.clave) ?? [];
      return [c.clave, interaccion ? carrilesConTope(deLaColumna, solo ? CARRILES_EN_EL_CELULAR : CARRILES_EN_LA_PC) : { ...carrilesDeLaColumna(deLaColumna), ocultos: new Set<string>(), desbordes: [], carrilesMax: 1 }];
    }),
  );
  const estiloGrilla = {
    gridTemplateColumns: solo
      ? "3.5rem minmax(0, 1fr)"
      : interaccion
        ? `3.5rem ${columnas.map((c) => anchoDeLaColumna(reparto.get(c.clave)?.carrilesMax ?? 1)).join(" ")}`
        : `3.5rem repeat(${columnas.length}, minmax(9.5rem, 1fr))`,
    gridTemplateRows: `2.75rem repeat(${filas}, var(--fila))`,
  } as CSSProperties;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {/* Sin turnos no hay nada que filtrar: «Todos 0» sobra (el día vacío es la grilla libre). */}
        {turnos.length > 0 ? (
        <div data-ui="filtros" role="group" aria-label="Ver">
          {FILTROS_AGENDA.map((f) => {
            const n = f.id === "todos" ? turnos.length : conteo(f.id);
            if (f.id !== "todos" && n === 0) return null;
            return (
              <Chip key={f.id} prendido={filtro === f.id} conteo={n} onClick={() => cambiarUrl({ ver: f.id === "todos" ? null : f.id })}>
                {f.etiqueta}
              </Chip>
            );
          })}
        </div>
        ) : (
          <span />
        )}
        {!solo && (
        <Segmented
          name="ver-por"
          leyenda="Ver la planilla por"
          value={verPor}
          onChange={(e) => {
            const valor = (e.target as unknown as HTMLInputElement).value;
            cambiarUrl({ por: valor === "box" ? "box" : null });
          }}
          opciones={[
            { valor: "profesional", etiqueta: "Por profesional" },
            { valor: "box", etiqueta: "Por box" },
          ]}
        />
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {sobreActual ? (sobreActual.veredicto.tipo === "ok" && sobreActual.destino ? `Soltá para mover a las ${fmtTime(sobreActual.destino.inicio)} con ${sobreActual.destino.profesional}` : sobreActual.veredicto.tipo === "no" ? sobreActual.veredicto.motivo : "") : interaccion ? anuncio : ""}
      </p>
      {aviso && (
        <p role="alert" className="mb-3 border-l-2 border-danger pl-3 text-sm text-body">
          {aviso}
        </p>
      )}

      <div
        className="overflow-x-auto border-t border-line-strong [--fila:2.75rem] lg:[--fila:2.25rem]"
        role="region"
        aria-label={solo ? `La agenda de ${columnas[0]?.titulo ?? "la profesional"}` : verPor === "box" ? "La agenda por box" : "La agenda por profesional"}
        tabIndex={0}
      >
        <div className="relative grid min-w-full text-sm" style={estiloGrilla}>
          <div className="sticky left-0 z-10 border-b border-line bg-surface" style={{ gridColumn: 1, gridRow: 1 }} />
          {columnas.map((c, i) => (
            <EncabezadoDeColumna key={c.clave} columna={c} numero={i} bloqueos={bloqueos} />
          ))}
          {Array.from({ length: filas }, (_, f) => (
            <div
              key={`h-${f}`}
              className="sticky left-0 z-10 border-b border-line bg-surface pr-2 pt-0.5 text-right text-xs tabular-nums text-muted"
              style={{ gridColumn: 1, gridRow: f + 2 }}
            >
              {(desde + f * PASO_MIN) % 60 === 0 ? horaDeMinuto(desde + f * PASO_MIN) : ""}
            </div>
          ))}

          {columnas.map((c, ci) => {
            const ocupados = (porColumna.get(c.clave) ?? []).filter((t) => t.estado !== "CANCELLED").map(enMinutos);
            return Array.from({ length: filas }, (_, f) => {
              const minuto = desde + f * PASO_MIN;
              const celda = estadoDeLaCelda({ dia, hoy, ahoraMin, minuto, columna: c, ocupados, bloqueos, puedeDarTurno: permisos.gestionar, nombreDe });
              const comun = {
                "data-celda": "",
                "data-columna": c.clave,
                "data-minuto": String(minuto),
                style: { gridColumn: ci + 2, gridRow: f + 2 } as CSSProperties,
              };
              if (celda.tipo === "hueco") {
                return (
                  <Link
                    key={`c-${c.clave}-${f}`}
                    {...comun}
                    href={celda.href}
                    prefetch={false}
                    aria-label={celda.etiqueta}
                    className="group flex items-center justify-center border-b border-l border-line/60 text-xs text-accent-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                  >
                    <span aria-hidden className={solo ? "text-muted group-hover:text-accent-ink" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}>
                      + {horaDeMinuto(minuto)}
                    </span>
                  </Link>
                );
              }
              return (
                <div
                  key={`c-${c.clave}-${f}`}
                  {...comun}
                  aria-hidden
                  title={celda.tipo === "bloqueada" ? (celda.motivo === FUERA_DE_HORARIO || celda.motivo === NO_TRABAJA_ESE_DIA ? `No atiende: ${celda.motivo}` : `No atiende (${celda.motivo})`) : undefined}
                  className={`border-b border-l border-line/60 ${celda.tipo === "bloqueada" ? "bg-surface-sunken" : ""}`}
                />
              );
            });
          })}

          {raya !== null && interaccion && (
            <>
              {/* Prendido: la raya va DETRÁS de los turnos (no tapa texto) y la hora sólo en la canaleta. */}
              <div
                role="separator"
                aria-label={`Ahora, ${fmtTime(reloj)}`}
                className="pointer-events-none z-0 h-0 self-start border-t-2 border-accent"
                style={{ gridColumn: "2 / -1", gridRow: Math.floor(raya / PASO_MIN) + 2, marginTop: `calc(var(--fila) * ${(raya % PASO_MIN) / PASO_MIN})` }}
              />
              <span
                aria-hidden
                className="pointer-events-none sticky left-0 z-[11] -translate-y-1/2 self-start justify-self-end bg-surface pr-2 text-[11px] font-semibold leading-none tabular-nums text-accent-ink"
                style={{ gridColumn: 1, gridRow: Math.floor(raya / PASO_MIN) + 2, marginTop: `calc(var(--fila) * ${(raya % PASO_MIN) / PASO_MIN})` }}
              >
                {fmtTime(reloj)}
              </span>
            </>
          )}
          {raya !== null && !interaccion && (
            <div
              role="separator"
              aria-label={`Ahora, ${fmtTime(reloj)}`}
              className="pointer-events-none z-[11] flex h-0 items-center self-start border-t-2 border-accent"
              style={{ gridColumn: "1 / -1", gridRow: Math.floor(raya / PASO_MIN) + 2, marginTop: `calc(var(--fila) * ${(raya % PASO_MIN) / PASO_MIN})` }}
            >
              <span className="sticky left-0 bg-surface pr-1 text-[11px] font-semibold leading-none tabular-nums text-accent-ink">
                {fmtTime(reloj)}
              </span>
            </div>
          )}

          {columnas.map((c, ci) => {
            const deLaColumna = porColumna.get(c.clave) ?? [];
            const { carriles, choques, ocultos, desbordes } = reparto.get(c.clave) ?? { ...carrilesDeLaColumna(deLaColumna), ocultos: new Set<string>(), desbordes: [] };
            const masN = desbordes.map((d) => {
              const fila = Math.max(0, Math.floor((d.desde - desde) / PASO_MIN));
              const nombres = d.ids.map((id) => deLaColumna.find((t) => t.id === id)).filter((t): t is TurnoDelDia => !!t);
              return (
                <button
                  key={`mas-${c.clave}-${d.desde}`}
                  type="button"
                  data-abrir
                  onClick={() => abrir(d.ids[0])}
                  aria-label={`${d.ids.length} turno${d.ids.length === 1 ? "" : "s"} más a esta hora: ${nombres.map((t) => `${fmtTime(t.inicio)} ${t.clienta}`).join(", ")}. Abrir el primero`}
                  title={nombres.map((t) => tituloDelTurno(t)).join("\n")}
                  className="z-[2] m-0.5 inline-flex min-h-6 items-center self-start justify-self-end rounded-full border border-line-strong bg-surface-inverted px-2 text-xs font-semibold tabular-nums text-surface hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  style={{ gridColumn: ci + 2, gridRow: fila + 2 }}
                >
                  +{d.ids.length}
                </button>
              );
            });
            return [...masN, ...deLaColumna.filter((t) => !ocultos.has(t.id)).map((t) => {
              const m = enMinutos(t);
              const fila = Math.max(0, Math.floor((m.desde - desde) / PASO_MIN));
              const alto = Math.max(1, Math.ceil((m.hasta - desde) / PASO_MIN) - fila);
              const { carril, de } = carriles.get(t.id) ?? { carril: 0, de: 1 };
              const marca = marcaDelTurno(t, reloj);
              const pedida = textoSeniaPedida(t, reloj);
              // La seña por Mercado Pago pide una persona: se lee en el title y el aria-label; el detalle, en el cajón.
              const avisoMP = textosAvisoMP(t).length > 0 ? "Mercado Pago: revisar la seña" : null;
              const movible = permisos.gestionar && sePuedeMover(t);
              const atenuado = filtro !== "todos" && !entraEnFiltro(t, filtro, reloj);
              const choca = choques.has(t.id);
              const enUnaLinea = interaccion && esTurnoCorto(t);
              // Prendido, hasta 1 h (dos filas): hora, clienta y servicio en la primera línea y el estado
              // en la segunda; en tres líneas el servicio quedaba cortado al medio (QA T2, 1366).
              const compacto = interaccion && !enUnaLinea && alto <= 2;
              const conBarra = interaccion && hayBarra(teclasDeLaBarra(t, permisos, relojDeLaMesa));
              // Prendida: el turno que se puede mover también se estira y se levanta con el dedo o con M.
              const estirable = interaccion && movible;
              const envuelto = conBarra || estirable;
              const estiraEste = estirando?.id === t.id ? estirando : null;
              const ubicacion = {
                gridColumn: ci + 2,
                gridRow: `${fila + 2} / span ${alto}`,
                justifySelf: "start",
                width: `calc(${100 / de}% - 4px)`,
                margin: `2px 0 2px calc(${(100 * carril) / de}% + 2px)`,
              } as const;
              const bloque = (
                <button
                  key={t.id}
                  type="button"
                  data-abrir
                  data-atenuado={atenuado || undefined}
                  onClick={(e) => {
                    if (recienSoltado.current) {
                      recienSoltado.current = false;
                      return;
                    }
                    if (conBarra) alBarra({ tipo: "toque", id: t.id, tactil: e.detail !== 0 && ultimoPuntero.current === "touch", conBarra });
                    else abrir(t.id);
                  }}
                  onPointerDown={(e) => {
                    ultimoPuntero.current = e.pointerType;
                    if (estirable && e.pointerType === "touch" && e.button === 0) {
                      // Prendida, táctil: mantener 300 ms levanta; si antes el dedo se corre, es scroll.
                      const x0 = e.clientX;
                      const y0 = e.clientY;
                      arrastre.current = { id: t.id, x0, y0, activo: false, tactil: true };
                      if (pulsacion.current !== null) window.clearTimeout(pulsacion.current);
                      pulsacion.current = window.setTimeout(() => {
                        pulsacion.current = null;
                        const a = arrastre.current;
                        if (!a || a.id !== t.id || a.activo) return;
                        a.activo = true;
                        setArrastreTactil(true);
                        setArrastrando(t.id);
                        setSobre(celdaBajo(x0, y0));
                        consultar(t.id);
                        setAnuncio(`Levantaste el turno de ${t.clienta}: llevalo y soltalo donde va.`);
                        navigator.vibrate?.(10);
                      }, PULSACION_MS);
                      return;
                    }
                    if (!movible || e.button !== 0 || e.pointerType === "touch") return;
                    arrastre.current = { id: t.id, x0: e.clientX, y0: e.clientY, activo: false };
                  }}
                  onPointerMove={(e) => {
                    const a = arrastre.current;
                    if (!a || a.id !== t.id) return;
                    if (!a.activo) {
                      if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < UMBRAL_ARRASTRE) return;
                      if (a.tactil) {
                        // Se corrió antes de los 300 ms: era deslizar la grilla, no levantar.
                        cancelar();
                        return;
                      }
                      a.activo = true;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setArrastrando(t.id);
                      // El aviso anterior NO se borra acá: sacarlo correría la grilla en medio del
                      // arrastre (se suelta en otra celda). Se reemplaza al soltar.
                      consultar(t.id);
                    }
                    const celda = celdaBajo(e.clientX, e.clientY);
                    setSobre((s) => (s?.columna === celda?.columna && s?.minuto === celda?.minuto ? s : celda));
                  }}
                  onPointerUp={(e) => {
                    const a = arrastre.current;
                    if (!a || a.id !== t.id) return;
                    if (a.activo) {
                      recienSoltado.current = true;
                      // En táctil el click puede no llegar después de arrastrar: que no se trague el próximo toque.
                      if (a.tactil) window.setTimeout(() => (recienSoltado.current = false), 400);
                      soltar(t, celdaBajo(e.clientX, e.clientY));
                    } else if (a.tactil) cancelar();
                    else arrastre.current = null;
                  }}
                  onPointerCancel={cancelar}
                  onContextMenu={estirable ? (e) => e.preventDefault() : undefined}
                  onKeyDown={estirable ? (e) => alTeclado(e, t, ci) : undefined}
                  onKeyUp={
                    estirable
                      ? (e) => {
                          if (e.key === "Shift" && estirando?.id === t.id && estirando.via === "teclado") void guardarDuracion(t, estirando.fin);
                        }
                      : undefined
                  }
                  onBlur={
                    estirable
                      ? () => {
                          if (levantadoConTeclado.current === t.id) cancelar();
                          if (estirando?.id === t.id && estirando.via === "teclado") setEstirando(null);
                        }
                      : undefined
                  }
                  aria-keyshortcuts={estirable ? "M Shift+ArrowUp Shift+ArrowDown" : undefined}
                  title={interaccion ? tituloDelTurno(t, [verPor === "box" && t.profesional, marca.texto, pedida, avisoMP, choca && "se pisa con otro turno"]) : undefined}
                  aria-label={`${fmtTime(t.inicio)}, ${t.clienta}, ${t.servicio}, ${marca.texto}${pedida ? `, ${pedida}` : ""}${avisoMP ? `, ${avisoMP}` : ""}${choca ? ", se pisa con otro turno" : ""}: abrir el turno`}
                  className={`${envuelto ? "h-full w-full" : "z-[1] self-stretch"} flex min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded border border-line-strong bg-surface-raised px-2 py-1 text-left hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus ${
                    movible ? "lg:cursor-grab" : ""
                  } ${atenuado ? "opacity-40" : ""} ${arrastrando === t.id ? "opacity-60" : ""}${estirable ? " select-none [-webkit-touch-callout:none]" : ""}`}
                  style={envuelto ? undefined : ubicacion}
                >
                  {enUnaLinea ? (
                    // Prendido, ≤ 30': una línea «16:00 Ana · Peeling» y la forma del estado (la palabra
                    // está en el aria-label y en el title; el detalle, en el cajón).
                    <span className="flex w-full min-w-0 items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-xs font-semibold tabular-nums text-strong">{lineaDelTurno(t).slice(0, 5)}</span>{" "}
                        <span className="font-medium text-strong">{lineaDelTurno(t).slice(6)}</span>
                      </span>
                      <Marca tipo={choca ? "atencion" : marca.tipo} className="shrink-0">
                        <span className="sr-only">{choca ? "Se pisa con otro turno" : marca.texto}</span>
                      </Marca>
                    </span>
                  ) : (
                  <span className="flex w-full min-w-0 items-baseline gap-1.5">
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-strong">{fmtTime(t.inicio)}</span>
                    <span className={`truncate font-medium text-strong${compacto ? " max-w-[60%] shrink-0" : ""}`}>{t.clienta}</span>
                    {compacto && (
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">
                        · {verPor === "box" ? `${t.servicio} · ${t.profesional}` : t.servicio}
                        {pedida ? " · seña pedida" : ""}
                        {avisoMP ? " · revisar seña MP" : ""}
                      </span>
                    )}
                  </span>
                  )}
                  {!enUnaLinea && !compacto && alto > 1 && (
                    <span className="w-full truncate text-xs text-muted">
                      {verPor === "box" ? `${t.servicio} · ${t.profesional}` : t.servicio}
                      {pedida ? " · seña pedida" : ""}
                      {avisoMP ? " · revisar seña MP" : ""}
                    </span>
                  )}
                  {!enUnaLinea && alto > 1 && !choca && <Marca tipo={marca.tipo}>{marca.texto}</Marca>}
                  {!enUnaLinea && choca && <Marca tipo="atencion">{verPor === "box" ? "Choca en el box" : "Se pisa con otro turno"}</Marca>}
                </button>
              );
              if (!envuelto) return bloque;
              const vista = conBarra ? vistaDeLaBarra(seleccion, t.id) : "cerrada";
              const lado = ladoDeLaBarra({ fila, alto, filas, columna: ci, columnas: columnas.length });
              // Minutos que cubre el bloque (desde el borde de su primera fila) y los del fin estirado.
              const minutosDelBloque = alto * PASO_MIN;
              const corrimiento = m.desde - (desde + fila * PASO_MIN);
              const veredictoDelFin = estiraEste ? veredictoEstirar(t, estiraEste.fin) : null;
              return (
                <div
                  key={t.id}
                  data-turno-barra={conBarra ? t.id : undefined}
                  className={`${conBarra ? "group/turno " : ""}relative flex min-w-0 self-stretch hover:z-20 focus-within:z-20 ${vista === "elegida" || estiraEste ? "z-20" : "z-[1]"}`}
                  style={ubicacion}
                  onKeyDown={
                    conBarra
                      ? (e) => {
                          if (e.key !== "Escape" || vista === "cerrada") return;
                          alBarra({ tipo: "escape", id: t.id });
                          e.currentTarget.querySelector<HTMLElement>("[data-abrir]")?.focus();
                        }
                      : undefined
                  }
                  onPointerLeave={conBarra ? (e) => e.pointerType !== "touch" && vista === "cerrada" && alBarra({ tipo: "salir", id: t.id }) : undefined}
                  onBlur={
                    conBarra
                      ? (e) => {
                          if (vista === "cerrada" && !e.currentTarget.contains(e.relatedTarget as Node | null)) alBarra({ tipo: "salir", id: t.id });
                        }
                      : undefined
                  }
                >
                  {bloque}
                  {estiraEste && veredictoDelFin && (
                    <span
                      aria-hidden
                      data-estirando
                      className={`pointer-events-none absolute inset-x-0 top-0 z-[2] rounded border-2 border-dashed ${
                        veredictoDelFin.tipo === "no" ? "border-danger bg-danger-soft/60" : "border-success bg-success-soft/60"
                      }`}
                      style={{ height: `calc(100% * ${(corrimiento + (new Date(estiraEste.fin).getTime() - new Date(t.inicio).getTime()) / 60_000) / minutosDelBloque})` }}
                    >
                      {/* Chip flotante abajo del bloque: no se pisa con la línea del estado (QA T2). */}
                      <span
                        className={`absolute left-0 top-full mt-1 w-max max-w-[18rem] rounded border px-2 py-0.5 text-xs font-semibold shadow-overlay ${
                          veredictoDelFin.tipo === "no" ? "border-danger bg-danger-soft text-danger" : "border-success bg-success-soft text-success"
                        }`}
                      >
                        {veredictoDelFin.tipo === "no" ? veredictoDelFin.motivo : rotuloDeDuracion(t.inicio, estiraEste.fin)}
                      </span>
                    </span>
                  )}
                  {estirable && (
                    <span
                      aria-hidden
                      data-manija
                      title="Estirar o acortar el turno"
                      className="absolute inset-x-2 -bottom-1 z-[3] flex h-4 cursor-ns-resize touch-none items-end justify-center"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const altoPx = e.currentTarget.parentElement?.getBoundingClientRect().height ?? 0;
                        const pxPorPaso = Math.max(4, (altoPx / minutosDelBloque) * PASO_DURACION_MIN);
                        manija.current = { id: t.id, y0: e.clientY, fin0: t.fin, fin: t.fin, pxPorPaso };
                        setEstirando({ id: t.id, fin: t.fin, via: "puntero" });
                      }}
                      onPointerMove={(e) => {
                        const h = manija.current;
                        if (!h || h.id !== t.id) return;
                        const fin = finEstirado(t.inicio, h.fin0, Math.round((e.clientY - h.y0) / h.pxPorPaso), topeDelDia);
                        if (fin === h.fin) return;
                        h.fin = fin;
                        setEstirando({ id: t.id, fin, via: "puntero" });
                        const v = veredictoEstirar(t, fin);
                        setAnuncio(v.tipo === "no" ? v.motivo : rotuloDeDuracion(t.inicio, fin));
                      }}
                      onPointerUp={(e) => {
                        const h = manija.current;
                        if (!h || h.id !== t.id) return;
                        e.stopPropagation();
                        manija.current = null;
                        void guardarDuracion(t, h.fin);
                      }}
                      onPointerCancel={() => {
                        manija.current = null;
                        setEstirando(null);
                      }}
                    >
                      <span className="mb-1 h-1 w-6 rounded-full bg-line-strong" />
                    </span>
                  )}
                  {conBarra && (
                  <div
                    className={`${claseDeLaBarra(vista, lado.vertical)} ${lado.vertical === "abajo" ? "top-full pt-1" : "bottom-full pb-1"} ${lado.horizontal === "izquierda" ? "left-0" : "right-0"}`}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="rounded-lg border border-line-strong bg-surface-raised p-1.5 shadow-lg">
                      <BarraDelTurno t={t} alAbrir={vista === "elegida" ? () => alBarra({ tipo: "toque", id: t.id, tactil: true, conBarra }) : undefined} />
                    </div>
                  </div>
                  )}
                </div>
              );
            })];
          })}

          {turnoArrastrado && sobre && sobreActual && (
            <FantasmaDelArrastre
              columna={columnas.findIndex((c) => c.clave === sobre.columna)}
              fila={Math.floor((sobre.minuto - desde) / PASO_MIN)}
              alto={Math.max(1, Math.ceil((enMinutos(turnoArrastrado).hasta - enMinutos(turnoArrastrado).desde) / PASO_MIN))}
              veredicto={sobreActual.veredicto}
              destino={sobreActual.destino}
            />
          )}
        </div>
      </div>

      <ul aria-label="Qué quiere decir cada marca" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        {LEYENDA_DE_LA_GRILLA.map((e) => (
          <li key={e.tipo}>
            <Marca tipo={e.tipo}>{e.palabra}</Marca>
          </li>
        ))}
      </ul>
      {permisos.gestionar && (
        <p className="mt-2 text-xs text-muted">
          {interaccion
            ? "Tocá un hueco para dar un turno a esa hora. Arrastrá un turno para moverlo (en el celular, mantenelo apretado) y estirá su borde de abajo para cambiar cuánto dura. Con el teclado: M lo levanta, flechas y Enter lo sueltan; Shift + flechas lo estiran."
            : "Tocá un hueco para dar un turno a esa hora. Para mover un turno, arrastralo (en la compu) o abrilo y tocá «Mover»."}
        </p>
      )}

      <ConfirmarMover turno={turnoAConfirmar} destino={aConfirmar?.destino ?? null} onCerrar={() => setAConfirmar(null)} />
      {interaccion && cambio && <AvisoDeshacerCambio key={cambio.clave} {...cambio} onTermina={() => setCambio(null)} />}
    </div>
  );
}

/**
 * La barra flotante: escondida, salvo elegida (táctil) o con el mouse encima / el foco del teclado
 * adentro. Aparece en ≤ 150 ms (opacidad + un corrimiento corto); con «reducir movimiento», de golpe.
 */
function claseDeLaBarra(vista: "elegida" | "al-pasar" | "cerrada", vertical: "abajo" | "arriba"): string {
  const base = "absolute z-30 w-max max-w-[min(20rem,calc(100vw-5rem))] max-lg:max-w-full transition-[opacity,transform,visibility] duration-150 motion-reduce:transition-none";
  const escondida = `invisible pointer-events-none opacity-0 ${vertical === "abajo" ? "translate-y-1" : "-translate-y-1"}`;
  if (vista === "elegida") return `${base} visible opacity-100 translate-y-0`;
  if (vista === "cerrada") return `${base} ${escondida}`;
  return `${base} ${escondida} group-hover/turno:visible group-hover/turno:pointer-events-auto group-hover/turno:opacity-100 group-hover/turno:translate-y-0 group-has-[:focus-visible]/turno:visible group-has-[:focus-visible]/turno:pointer-events-auto group-has-[:focus-visible]/turno:opacity-100 group-has-[:focus-visible]/turno:translate-y-0`;
}

function EncabezadoDeColumna({ columna, numero, bloqueos }: { columna: ColumnaDeLaGrilla; numero: number; bloqueos: readonly BloqueoDelDia[] }) {
  const ausencia = ausenciaDeLaColumna(columna.profesionalIds, bloqueos);
  return (
    <div className="flex min-w-0 flex-col justify-center border-b border-l border-line px-2" style={{ gridColumn: numero + 2, gridRow: 1 }}>
      <span className="truncate font-semibold text-strong">{columna.titulo}</span>
      {(columna.detalle || ausencia) && (
        <span className="truncate text-xs text-muted">
          {columna.detalle}
          {ausencia ? `${columna.detalle ? " · " : ""}${ausencia.tipo === "horario" ? ausencia.motivo : `no atiende (${ausencia.motivo})`}` : ""}
        </span>
      )}
    </div>
  );
}

/** Dónde caería el turno al soltarlo: verde si entra, con el motivo si no. */
function FantasmaDelArrastre({
  columna,
  fila,
  alto,
  veredicto,
  destino,
}: {
  columna: number;
  fila: number;
  alto: number;
  veredicto: VeredictoDelDestino;
  destino: Destino | null;
}) {
  if (columna < 0 || fila < 0 || veredicto.tipo === "igual") return null;
  const tono =
    veredicto.tipo === "ok" ? "border-success bg-success-soft text-success" : veredicto.tipo === "no" ? "border-danger bg-danger-soft text-danger" : "border-line-strong bg-surface-sunken text-muted";
  return (
    <div
      aria-hidden
      className={`pointer-events-none z-[4] m-0.5 overflow-hidden rounded border-2 border-dashed px-2 py-1 text-xs font-semibold ${tono}`}
      style={{ gridColumn: columna + 2, gridRow: `${fila + 2} / span ${alto}` }}
    >
      {veredicto.tipo === "ok" ? (destino ? `Soltá: ${fmtTime(destino.inicio)} con ${destino.profesional}` : "") : veredicto.motivo}
    </div>
  );
}
