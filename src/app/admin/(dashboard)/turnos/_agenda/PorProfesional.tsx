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
//
// En el celular la planilla se desliza de costado dentro de su marco (la hora queda fija a la
// izquierda); la página no.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Chip, Marca, Segmented } from "@/components/ui";
import { businessWallTimeToUtc, dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import { huecosParaMover } from "@/lib/turnos/mover-actions";
import { FILTROS_AGENDA, entraEnFiltro, leerFiltroAgenda, marcaDelTurno, textoSeniaPedida, type TurnoDelDia } from "../agenda-core";
import {
  LEYENDA_DE_LA_GRILLA,
  PASO_MIN,
  carrilesDeLaColumna,
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
import { ConfirmarMover } from "./MoverTurno";
import { destinoDelArrastre, sePuedeMover, veredictoDelDestino, type Destino, type VeredictoDelDestino } from "./mover-core";

/** Lo que sabe la planilla del servidor para validar el arrastre de UN turno. */
type Consulta = { turnoId: string; hacen: Set<string> | null; nombres: Map<string, string>; huecos: Record<string, string[]> | null; error?: string };

type Arrastre = { id: string; x0: number; y0: number; activo: boolean };

/** Distancia mínima (px) para que un apretar-y-mover sea arrastre y no un toque. */
const UMBRAL_ARRASTRE = 6;

export default function PorProfesional({
  turnos,
  profesionales,
  ahora,
  dia,
  bloqueos = [],
}: {
  turnos: TurnoDelDia[];
  profesionales: { id: string; nombre: string; box: string | null }[];
  ahora: string;
  /** El día que se mira ("YYYY-MM-DD", hora del negocio). */
  dia: string;
  /** Francos y ausencias del día (sus celdas no se ofrecen como hueco). */
  bloqueos?: BloqueoDelDia[];
}) {
  const { permisos, abrir, cambiarUrl } = useMesa();
  const params = useSearchParams();
  const verPor = leerVerPor(params.get("por"));
  const filtro = leerFiltroAgenda(params.get("ver"));
  const reloj = new Date(ahora);
  const hoy = dateStrInBusinessTz(reloj);
  const ahoraMin = minutosDelDia(reloj);

  const columnas = columnasDeLaGrilla(verPor, profesionales, turnos);
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

  const cancelar = () => {
    arrastre.current = null;
    setArrastrando(null);
    setSobre(null);
  };

  useEffect(() => {
    if (!arrastrando) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelar();
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
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
      setAConfirmar({ turnoId: t.id, destino });
    } else if (veredicto.tipo === "no") setAviso(`No se movió ${t.clienta}: ${veredicto.motivo}`);
    else if (veredicto.tipo === "buscando") setAviso("Todavía me estaba fijando si ese horario está libre: soltalo de nuevo en un segundo.");
  };

  const turnoArrastrado = arrastrando ? turnos.find((t) => t.id === arrastrando) : undefined;
  const sobreActual = turnoArrastrado && sobre ? destinoDe(turnoArrastrado, sobre) : null;
  const turnoAConfirmar = aConfirmar ? (turnos.find((t) => t.id === aConfirmar.turnoId) ?? null) : null;
  const conteo = (f: (typeof FILTROS_AGENDA)[number]["id"]) => turnos.filter((t) => entraEnFiltro(t, f, reloj)).length;

  const estiloGrilla = {
    gridTemplateColumns: `3.5rem repeat(${columnas.length}, minmax(9.5rem, 1fr))`,
    gridTemplateRows: `2.75rem repeat(${filas}, var(--fila))`,
  } as CSSProperties;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
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
      </div>

      <p aria-live="polite" className="sr-only">
        {sobreActual ? (sobreActual.veredicto.tipo === "ok" && sobreActual.destino ? `Soltá para mover a las ${fmtTime(sobreActual.destino.inicio)} con ${sobreActual.destino.profesional}` : sobreActual.veredicto.tipo === "no" ? sobreActual.veredicto.motivo : "") : ""}
      </p>
      {aviso && (
        <p role="alert" className="mb-3 border-l-2 border-danger pl-3 text-sm text-body">
          {aviso}
        </p>
      )}

      <div
        className="overflow-x-auto border-t border-line-strong [--fila:2.75rem] lg:[--fila:2.25rem]"
        role="region"
        aria-label={verPor === "box" ? "La agenda por box" : "La agenda por profesional"}
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
                    <span aria-hidden className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
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

          {raya !== null && (
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
            const { carriles, choques } = carrilesDeLaColumna(deLaColumna);
            return deLaColumna.map((t) => {
              const m = enMinutos(t);
              const fila = Math.max(0, Math.floor((m.desde - desde) / PASO_MIN));
              const alto = Math.max(1, Math.ceil((m.hasta - desde) / PASO_MIN) - fila);
              const { carril, de } = carriles.get(t.id) ?? { carril: 0, de: 1 };
              const marca = marcaDelTurno(t, reloj);
              const pedida = textoSeniaPedida(t, reloj);
              const movible = permisos.gestionar && sePuedeMover(t);
              const atenuado = filtro !== "todos" && !entraEnFiltro(t, filtro, reloj);
              const choca = choques.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  data-abrir
                  data-atenuado={atenuado || undefined}
                  onClick={() => {
                    if (recienSoltado.current) {
                      recienSoltado.current = false;
                      return;
                    }
                    abrir(t.id);
                  }}
                  onPointerDown={(e) => {
                    if (!movible || e.button !== 0 || e.pointerType === "touch") return;
                    arrastre.current = { id: t.id, x0: e.clientX, y0: e.clientY, activo: false };
                  }}
                  onPointerMove={(e) => {
                    const a = arrastre.current;
                    if (!a || a.id !== t.id) return;
                    if (!a.activo) {
                      if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < UMBRAL_ARRASTRE) return;
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
                      soltar(t, celdaBajo(e.clientX, e.clientY));
                    } else arrastre.current = null;
                  }}
                  onPointerCancel={cancelar}
                  aria-label={`${fmtTime(t.inicio)}, ${t.clienta}, ${t.servicio}, ${marca.texto}${pedida ? `, ${pedida}` : ""}${choca ? ", se pisa con otro turno" : ""}: abrir el turno`}
                  className={`z-[1] flex min-w-0 flex-col items-start gap-0.5 self-stretch overflow-hidden rounded border border-line-strong bg-surface-raised px-2 py-1 text-left hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus ${
                    movible ? "lg:cursor-grab" : ""
                  } ${atenuado ? "opacity-40" : ""} ${arrastrando === t.id ? "opacity-60" : ""}`}
                  style={{
                    gridColumn: ci + 2,
                    gridRow: `${fila + 2} / span ${alto}`,
                    justifySelf: "start",
                    width: `calc(${100 / de}% - 4px)`,
                    margin: `2px 0 2px calc(${(100 * carril) / de}% + 2px)`,
                  }}
                >
                  <span className="flex w-full items-baseline gap-1.5">
                    <span className="text-xs font-semibold tabular-nums text-strong">{fmtTime(t.inicio)}</span>
                    <span className="truncate font-medium text-strong">{t.clienta}</span>
                  </span>
                  {alto > 1 && (
                    <span className="w-full truncate text-xs text-muted">
                      {verPor === "box" ? `${t.servicio} · ${t.profesional}` : t.servicio}
                      {pedida ? " · seña pedida" : ""}
                    </span>
                  )}
                  {alto > 1 && !choca && <Marca tipo={marca.tipo}>{marca.texto}</Marca>}
                  {choca && <Marca tipo="atencion">{verPor === "box" ? "Choca en el box" : "Se pisa con otro turno"}</Marca>}
                </button>
              );
            });
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
          Tocá un hueco para dar un turno a esa hora. Para mover un turno, arrastralo (en la compu) o abrilo y tocá «Mover».
        </p>
      )}

      <ConfirmarMover turno={turnoAConfirmar} destino={aConfirmar?.destino ?? null} onCerrar={() => setAConfirmar(null)} />
    </div>
  );
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
