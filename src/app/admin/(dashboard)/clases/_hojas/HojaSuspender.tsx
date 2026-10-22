"use client";

// HOJA «🌧 SE SUSPENDE» y «BLOQUEAR DÍAS» (F3 · M-036/M-037/M-038 · E18 · §2.3).
//
// · Un día: «Todo el día» o «Desde las…», el motivo (Lluvia por defecto) y el resumen «6 clases
//   afectadas» ANTES de tocar nada (con las clases que ya tiene la pantalla). Después:
//   «Cancelar las 6 y avisar» → la cola «Avisar a Juan (1 de 6)» (las pagadas quedan a favor), o
//   «Moverlas al primer hueco» → una propuesta por clase, que se confirma de a una.
// · Varios días (viaje, torneo): desde / hasta → se bloquea y, si había clases adentro, «Tenés 4
//   clases en esos días → ¿qué hacemos?».
// El día queda bloqueado en los dos casos: el turnero deja de ofrecerlo.

import { useId, useMemo, useState } from "react";
import { Chip } from "@/components/ui";
import { bloquearRango, cancelarConMotivo, moverHorario, suspenderDia } from "@/lib/padel/acciones";
import { diaHoraCorta, horaHumana, sumarDias, type MotivoCancel } from "@/lib/padel/core";
import { clases as nClases } from "../_agenda-core";
import type { ItemAviso } from "../_aviso";
import { ErrorAccion, HojaPanel, Pie, Rotulo, aCola, chip48, grande, useAccion } from "./comun";
import { MOTIVOS_SUSPENDER, afectadasEnVentana, textoPropuesta, ventanaDeSuspension, type ClaseDelDia } from "./proponer";

type Propuesta = { claseId: string; nombre: string; desde: string; propuesta: string | null };
type Afectada = { claseId: string; nombre: string; empiezaEn: string; estado: string };
type Respuesta = { afectadas: Afectada[]; avisos: Parameters<typeof aCola>[0]; propuestas: Propuesta[]; fallidas: { claseId: string; error: string }[] };

export type PropsSuspender =
  | { modo: "dia"; fecha: string; etiquetaDia: string; clases: readonly ClaseDelDia[]; onCerrar: () => void }
  | { modo: "rango"; desde: string; onCerrar: () => void };

/** "2026-10-23" → "23/10". */
const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

const textoDe = (afectadas: readonly Afectada[], listo: string) => {
  const porId = new Map(afectadas.map((a) => [a.claseId, a]));
  return (id: string | null) => {
    const a = id ? porId.get(id) : undefined;
    return a ? `${listo}: ${horaHumana(new Date(a.empiezaEn))} ${a.nombre.split(/\s+/)[0]}` : listo;
  };
};

export function HojaSuspender(props: PropsSuspender) {
  const { onCerrar } = props;
  const { pendiente, error, ejecutar, encolar } = useAccion("");
  const [modoHora, setModoHora] = useState<"todo" | "desde">("todo");
  const [desdeHora, setDesdeHora] = useState("");
  const [motivo, setMotivo] = useState<MotivoCancel>(props.modo === "dia" ? "LLUVIA" : "OTRO");
  const [rango, setRango] = useState({ desde: props.modo === "rango" ? props.desde : "", hasta: props.modo === "rango" ? sumarDias(props.desde, 6) : "" });
  // Varios días: después de bloquear, las clases que caían adentro.
  const [bloqueadas, setBloqueadas] = useState<Afectada[] | null>(null);
  // «Moverlas»: las propuestas y lo que ya se resolvió de a una.
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null);
  const [resueltas, setResueltas] = useState<Record<string, string>>({});
  const [juntados, setJuntados] = useState<ItemAviso[]>([]);
  const idHora = useId();
  const idMotivo = useId();
  const idDesde = useId();
  const idHasta = useId();

  const ventana = ventanaDeSuspension(modoHora, desdeHora);
  const previas = useMemo(
    () => (props.modo === "dia" ? afectadasEnVentana(props.clases, props.fecha, ventana.desde, ventana.hasta, new Date()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.modo, ventana.desde, ventana.hasta],
  );

  const cerrarConCola = (items: ItemAviso[]) => {
    onCerrar();
    if (items.length) encolar(items);
  };

  /** Corre la del servidor; si algo no se pudo, lo dice y deja la hoja abierta. */
  const resolver = (fn: () => Promise<{ ok: true } & Respuesta | { ok: false; error: string }>, accion: "nada" | "cancelar" | "proponer", listo: string) =>
    ejecutar(async () => {
      const r = await fn();
      if (!r.ok) return r.error;
      if (accion === "proponer") {
        setPropuestas(r.propuestas);
        return null;
      }
      if (accion === "nada" && props.modo === "rango") {
        if (r.afectadas.length) {
          setBloqueadas(r.afectadas);
          return null;
        }
        cerrarConCola([{ texto: `Bloqueado del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)}`, nombre: "" }]);
        return null;
      }
      const items = r.avisos.length ? aCola(r.avisos, textoDe(r.afectadas, listo)) : [{ texto: listo, nombre: "" }];
      if (r.fallidas.length) {
        setJuntados(items);
        return `No pudimos con ${nClases(r.fallidas.length)}: ${r.fallidas.map((f) => f.error).join(" · ")}`;
      }
      cerrarConCola(items);
      return null;
    });

  const correrDia = (accion: "nada" | "cancelar" | "proponer") => {
    if (props.modo !== "dia") return;
    resolver(() => suspenderDia(props.fecha, ventana.desde, ventana.hasta, accion, motivo), accion, accion === "nada" ? `Suspendido: ${props.etiquetaDia}` : "Se suspende");
  };
  const correrRango = (accion: "nada" | "cancelar" | "proponer") =>
    resolver(() => bloquearRango(rango.desde, rango.hasta, accion, motivo), accion, "Cancelada");

  /** Una propuesta: moverla ahí, o cancelarla con el motivo. */
  const resolverUna = (p: Propuesta, como: "mover" | "cancelar") =>
    ejecutar(async () => {
      const r = como === "mover" && p.propuesta ? await moverHorario(p.claseId, p.propuesta) : await cancelarConMotivo(p.claseId, motivo);
      if (!r.ok) return `${p.nombre.split(/\s+/)[0]}: ${r.error}`;
      const texto = como === "mover" && "cuando" in r && r.cuando ? `Movida: ${r.cuando}` : "Cancelada";
      setResueltas((m) => ({ ...m, [p.claseId]: como === "mover" ? "✓ Movida" : "✓ Cancelada" }));
      setJuntados((j) => [...j, { texto, nombre: p.nombre, wa: r.wa, enviado: r.enviado, avisoId: r.avisoId ?? null }]);
      return null;
    });

  const titulo = props.modo === "dia" ? `🌧 Se suspende · ${props.etiquetaDia}` : "Bloquear días";

  // ── Paso «Moverlas»: una propuesta por clase, de a una ──
  if (propuestas) {
    const faltan = propuestas.filter((p) => !resueltas[p.claseId]).length;
    return (
      <HojaPanel
        onCerrar={() => cerrarConCola(juntados)}
        titulo="Moverlas al primer hueco"
        descripcion={faltan ? `Confirmá cada una. ${faltan === 1 ? "Falta 1" : `Faltan ${faltan}`}.` : "Listo: ya resolviste todas."}
        pie={
          <Pie>
            <button type="button" onClick={() => cerrarConCola(juntados)} className={grande(faltan ? "outline" : "solid")} data-qa="listo-propuestas">
              {juntados.length ? `Listo · avisar a ${juntados.length}` : "Listo"}
            </button>
          </Pie>
        }
      >
        <ul className="grid gap-2" aria-busy={pendiente} data-qa="propuestas">
          {propuestas.map((p) => (
            <li key={p.claseId} className="grid gap-2 rounded-xl border border-line p-3">
              <p className="text-sm font-semibold tabular-nums text-strong">{textoPropuesta(p)}</p>
              {resueltas[p.claseId] ? (
                <p className="text-sm text-muted">{resueltas[p.claseId]}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {p.propuesta ? (
                    <button type="button" disabled={pendiente} onClick={() => resolverUna(p, "mover")} className={grande()} data-qa="mover-propuesta">
                      Mover
                    </button>
                  ) : (
                    <span className="self-center text-sm text-muted">Movela a mano desde la tarjeta</span>
                  )}
                  <button type="button" disabled={pendiente} onClick={() => resolverUna(p, "cancelar")} className={grande("outline")} data-qa="cancelar-propuesta">
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <ErrorAccion texto={error} className="mt-3" />
      </HojaPanel>
    );
  }

  // ── Varios días, ya bloqueados: ¿qué hacemos con las que caían adentro? ──
  if (props.modo === "rango" && bloqueadas) {
    return (
      <HojaPanel
        onCerrar={onCerrar}
        titulo="Listo, quedó bloqueado"
        descripcion={`Tenés ${nClases(bloqueadas.length)} en esos días. ¿Qué hacemos?`}
        pie={
          <Pie>
            <button type="button" disabled={pendiente} onClick={() => correrRango("cancelar")} className={grande("danger")} data-qa="cancelar-todas">
              Cancelar {bloqueadas.length === 1 ? "la clase" : `las ${bloqueadas.length}`} y avisar
            </button>
            <button type="button" disabled={pendiente} onClick={() => correrRango("proponer")} className={grande("outline")} data-qa="moverlas">
              Moverlas al primer hueco
            </button>
            <button type="button" disabled={pendiente} onClick={onCerrar} className={grande("ghost")}>
              Dejarlas así por ahora
            </button>
          </Pie>
        }
      >
        <ListaAfectadas filas={bloqueadas.map((a) => ({ id: a.claseId, nombre: a.nombre, empiezaEn: a.empiezaEn, conDia: true }))} />
        <ErrorAccion texto={error} className="mt-3" />
      </HojaPanel>
    );
  }

  // ── El primer paso ──
  const n = previas.length;
  return (
    <HojaPanel
      onCerrar={juntados.length ? () => cerrarConCola(juntados) : onCerrar}
      titulo={titulo}
      descripcion={props.modo === "dia" ? "El turnero deja de ofrecer ese horario." : "Un viaje, un torneo: esos días no das clases."}
      pie={
        <Pie>
          {props.modo === "rango" ? (
            <button
              type="button"
              disabled={pendiente || !rango.desde || !rango.hasta || rango.hasta < rango.desde}
              onClick={() => correrRango("nada")}
              className={grande()}
              data-qa="bloquear"
            >
              {pendiente ? "Bloqueando…" : "Bloquear esos días"}
            </button>
          ) : n > 0 ? (
            <>
              <button type="button" disabled={pendiente} onClick={() => correrDia("cancelar")} className={grande("danger")} data-qa="cancelar-todas">
                {pendiente ? "Suspendiendo…" : `Cancelar ${n === 1 ? "la clase" : `las ${n}`} y avisar`}
              </button>
              <button type="button" disabled={pendiente} onClick={() => correrDia("proponer")} className={grande("outline")} data-qa="moverlas">
                Moverlas al primer hueco
              </button>
            </>
          ) : (
            <button type="button" disabled={pendiente} onClick={() => correrDia("nada")} className={grande()} data-qa="suspender">
              {pendiente ? "Suspendiendo…" : "Suspender"}
            </button>
          )}
        </Pie>
      }
    >
      {props.modo === "dia" ? (
        <>
          <Rotulo id={idHora}>¿Qué se suspende?</Rotulo>
          <div role="group" aria-labelledby={idHora} className="flex flex-wrap items-center gap-2">
            <Chip prendido={modoHora === "todo"} onClick={() => setModoHora("todo")} className={chip48} data-qa="todo-el-dia">
              Todo el día
            </Chip>
            <Chip prendido={modoHora === "desde"} onClick={() => setModoHora("desde")} className={chip48} data-qa="desde-las">
              Desde las…
            </Chip>
            {modoHora === "desde" && (
              <input
                type="time"
                step={900}
                aria-label="Desde qué hora"
                value={desdeHora}
                onChange={(e) => setDesdeHora(e.target.value)}
                className="h-12 rounded-xl border border-line-strong bg-surface-raised px-3 text-base tabular-nums text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              />
            )}
          </div>
        </>
      ) : (
        <div className="mt-1 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={idDesde} className="mb-1 block text-sm font-semibold text-strong">
              Desde
            </label>
            <input id={idDesde} type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} className="h-12 w-full rounded-xl border border-line-strong bg-surface-raised px-3 text-base text-strong" />
          </div>
          <div>
            <label htmlFor={idHasta} className="mb-1 block text-sm font-semibold text-strong">
              Hasta
            </label>
            <input id={idHasta} type="date" min={rango.desde} value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} className="h-12 w-full rounded-xl border border-line-strong bg-surface-raised px-3 text-base text-strong" />
          </div>
        </div>
      )}

      <Rotulo id={idMotivo}>¿Por qué?</Rotulo>
      <div role="group" aria-labelledby={idMotivo} className="flex flex-wrap gap-2">
        {MOTIVOS_SUSPENDER.map((m) => (
          <Chip key={m.valor} prendido={motivo === m.valor} onClick={() => setMotivo(m.valor)} className={chip48}>
            {m.etiqueta}
          </Chip>
        ))}
      </div>

      {props.modo === "dia" && (
        <>
          <Rotulo>{n === 0 ? "No tenés clases en ese horario." : `${n === 1 ? "1 clase afectada" : `${n} clases afectadas`}`}</Rotulo>
          {n > 0 && <ListaAfectadas filas={previas.map((c) => ({ id: c.id, nombre: c.nombre, empiezaEn: c.empiezaEn, conDia: false }))} />}
          {n > 0 && <p className="mt-2 text-sm text-muted">Las que estaban pagadas quedan a favor del alumno para la próxima.</p>}
        </>
      )}
      <ErrorAccion texto={error} className="mt-3" />
    </HojaPanel>
  );
}

function ListaAfectadas({ filas }: { filas: { id: string; nombre: string; empiezaEn: Date | string; conDia: boolean }[] }) {
  return (
    <ul className="grid gap-1 text-sm text-strong" data-qa="afectadas">
      {filas.map((f) => {
        const d = new Date(f.empiezaEn);
        return (
          <li key={f.id} className="flex gap-2 tabular-nums">
            <span className="font-semibold">{f.conDia ? diaHoraCorta(d) : horaHumana(d)}</span>
            <span>{f.nombre}</span>
          </li>
        );
      })}
    </ul>
  );
}
