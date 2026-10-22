"use client";

// ============================================================================
// MAÑANA — avisar a las de mañana, de a una, con una sola tecla («Renglón»).
// ============================================================================
//
// La agenda de siempre abría el día con «Mañana: confirmar» arriba y un botón primario de WhatsApp
// por turno: nueve teclas iguales compitiendo con el día de hoy. Acá mañana va al pie, plegado en
// un renglón («Viernes 25 · 7 turnos, 7 sin avisar») con UNA tecla: «Avisar a las 7». Abre una hoja
// que va de a una: la clienta, su turno, «WhatsApp» (abre el chat con el recordatorio listo y la
// marca avisada, igual que siempre: `marcarAvisada`) y pasa sola a la siguiente. «Saltear» no marca
// nada. Si el teléfono no es un celular, lo dice y lleva a corregirlo en su ficha.
//
// La lista entera es la app «Confirmar turnos de mañana» (turnos/manana), que usa `ListaDeManana`.
//
// MAÑANA CON RESPUESTAS (reingeniería CH, Tanda 2, §3.2, CH-027): al volver de WhatsApp, por clienta
// [Confirmó] (confirma: `confirmarTurno`, devuelve el error si el turno cambió) · [Quiere cambiar]
// (abre mover) · [Cancela] (abre la cancelación, que pregunta por la seña: `CancelarONoVino`), y
// arriba el contador «7 avisadas · 5 confirmadas · 1 cambia · 1 cancela» (manana/manana-core.ts).
// [Quiere cambiar] abre `MoverTurno` (chips de días con huecos + [Mover y avisar por WhatsApp]: el
// mismo turno, nunca uno nuevo). La clienta se toca y abre el turno en la agenda de mañana, con su
// cajón (`?date=…&turno=…`, lo lee la mesa de turnos).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmarTurno, marcarAvisada, type TurnoAConfirmar } from "@/lib/actions";
import { Button, Hoja, Marca, Renglon, type TipoMarca } from "@/components/ui";
import { fmtTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { useToast } from "../../ToastProvider";
import { fechaLarga, type TurnoDelDia } from "../agenda-core";
import MoverTurno from "./MoverTurno";
import CancelarONoVino from "./CancelarONoVino";
import { aFormData, camposDelTurno } from "./campos";
import {
  ETIQUETA_RESPUESTA,
  contarManana,
  respuestaDe,
  teclasDeRespuesta,
  textoDelContador,
  unirTurnos,
  type Respuesta,
} from "../manana/manana-core";

type Avisadas = Record<string, string>;

function useAvisar() {
  const [avisadas, setAvisadas] = useState<Avisadas>({});
  const [error, setError] = useState("");
  const avisar = async (t: TurnoAConfirmar) => {
    setError("");
    try {
      const r = await marcarAvisada(t.id);
      if (r.ok) setAvisadas((a) => ({ ...a, [t.id]: r.avisadaEl }));
      else setError(r.error);
    } catch {
      setError("Se abrió WhatsApp pero no quedó marcada como avisada. Probá de nuevo.");
    }
  };
  return { avisadas, avisar, error };
}

function ConfirmarUno({ t, onHecho }: { t: TurnoAConfirmar; onHecho?: (id: string) => void }) {
  const { showError, showSuccess } = useToast();
  const [pendiente, empezar] = useTransition();
  const [hecho, setHecho] = useState(false);
  if (t.status !== "PENDING") return null;
  if (hecho) return <Marca tipo="hecho">Confirmado</Marca>;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pendiente}
      estado={pendiente ? "cargando" : undefined}
      onClick={() =>
        empezar(async () => {
          try {
            const r = await confirmarTurno(aFormData(camposDelTurno(t.id)));
            if (!r.ok) {
              showError(r.error);
              return;
            }
            setHecho(true);
            onHecho?.(t.id);
            showSuccess(`Confirmado: ${t.clienta}, mañana ${fmtTime(t.startsAt)}.`);
          } catch {
            showError("No se pudo confirmar. Probá de nuevo.");
          }
        })
      }
    >
      Confirmar
    </Button>
  );
}

/** La hoja que va de a una. */
function Avisador({
  dia,
  turnos,
  abierta,
  onCerrar,
  onConfirmo,
}: {
  dia: string;
  turnos: TurnoAConfirmar[];
  abierta: boolean;
  onCerrar: () => void;
  onConfirmo?: (id: string) => void;
}) {
  const { avisadas, avisar, error } = useAvisar();
  // La cola se toma al abrir: al marcar una avisada el servidor refresca la lista, y recorrerla
  // viva por índice salteaba a la siguiente.
  const [pendientes] = useState(() => turnos.filter((t) => !t.avisadaEl));
  const [i, setI] = useState(0);
  const t = pendientes[i];
  const hechas = pendientes.filter((p) => avisadas[p.id]).length;
  const siguiente = () => setI((n) => n + 1);
  const wa = t ? waLinkClienta(t.telefono, t.texto) : null;

  return (
    <Hoja
      abierta={abierta}
      onCerrar={onCerrar}
      titulo={`Avisar a las de mañana`}
      descripcion={`${fechaLarga(dia)} · ${t ? `${Math.min(i + 1, pendientes.length)} de ${pendientes.length}` : `${hechas} avisadas`}`}
    >
      {!t ? (
        <div className="space-y-3 py-2">
          <p className="text-sm text-strong">
            {hechas > 0 ? `Listo: le avisaste a ${hechas === 1 ? "1 clienta" : `${hechas} clientas`}.` : "No queda nadie por avisar."}
          </p>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      ) : (
        <div className="space-y-4 py-1">
          <Renglon
            folio={<span className="text-[15px] font-semibold tabular-nums text-strong">{fmtTime(t.startsAt)}</span>}
            titulo={t.clienta}
            detalle={
              <>
                {t.servicio} · {t.profesional}{" "}
                <Marca tipo={t.status === "PENDING" ? "pendiente" : "hecho"}>{t.status === "PENDING" ? "Reservado" : "Confirmado"}</Marca>
              </>
            }
          />
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              data-ui="button"
              data-variant="solid"
              data-size="lg"
              className="flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-5 font-medium text-on-accent"
              onClick={async () => {
                await avisar(t);
                siguiente();
              }}
            >
              WhatsApp a {t.clienta.split(" ")[0]}
            </a>
          ) : (
            <p className="text-sm text-warning">
              El teléfono cargado ({t.telefono}) no es un celular.{" "}
              <Link href={`/admin/clientes/${encodeURIComponent(t.clientId)}`} className="inline-flex min-h-11 items-center font-medium underline">
                Corregilo en su ficha
              </Link>
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ConfirmarUno t={t} onHecho={onConfirmo} />
            <Button type="button" variant="ghost" onClick={siguiente}>
              Saltear
            </Button>
          </div>
          <p className="text-xs text-muted">WhatsApp abre el chat con el recordatorio escrito; revisalo y mandalo. El turno queda «avisada» con la hora.</p>
        </div>
      )}
    </Hoja>
  );
}

/** El renglón plegado del pie de la agenda de hoy. */
export function RenglonDeManana({ dia, turnos }: { dia: string; turnos: TurnoAConfirmar[] }) {
  const [abierta, setAbierta] = useState(false);
  const sinAvisar = turnos.filter((t) => !t.avisadaEl).length;
  const sinConfirmar = turnos.filter((t) => t.status === "PENDING").length;
  return (
    <section aria-label="Mañana" className="mt-8">
      <Renglon
        folio={<span className="font-semibold text-strong">Mañana</span>}
        titulo={
          turnos.length === 0
            ? `${fechaLarga(dia)} · sin turnos`
            : `${fechaLarga(dia)} · ${turnos.length === 1 ? "1 turno" : `${turnos.length} turnos`}${sinAvisar > 0 ? `, ${sinAvisar} sin avisar` : ", todas avisadas"}`
        }
        detalle={
          turnos.length === 0
            ? "Si alguien llama para mañana, dale el turno desde «Dar un turno»."
            : sinConfirmar > 0
              ? `${sinConfirmar} ${sinConfirmar === 1 ? "reservado sin confirmar" : "reservados sin confirmar"}. Cada aviso abre WhatsApp con el recordatorio listo.`
              : "Cada aviso abre WhatsApp con el recordatorio listo y marca el turno como avisado."
        }
        tecla={
          <>
            {sinAvisar > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setAbierta(true)}>
                Avisar a {sinAvisar === 1 ? "1" : `las ${sinAvisar}`}
              </Button>
            )}
            <Link href="/admin/turnos/manana" data-ui="button" data-variant="ghost" data-size="sm" className="inline-flex min-h-11 items-center px-3 text-sm">
              Ver la lista
            </Link>
          </>
        }
      />
      {abierta && <Avisador dia={dia} turnos={turnos} abierta={abierta} onCerrar={() => setAbierta(false)} />}
    </section>
  );
}

const MARCA_RESPUESTA: Record<Respuesta, TipoMarca> = { confirmo: "hecho", cambia: "medias", cancela: "anulado" };

/** [Confirmó]: confirma el turno con la acción de siempre; si el turno cambió, lo dice. */
function TeclaConfirmo({ t, onHecho }: { t: TurnoAConfirmar; onHecho: () => void }) {
  const { showError, showSuccess } = useToast();
  const [pendiente, empezar] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pendiente}
      estado={pendiente ? "cargando" : undefined}
      onClick={() =>
        empezar(async () => {
          try {
            const r = await confirmarTurno(aFormData(camposDelTurno(t.id)));
            if (!r.ok) {
              showError(r.error);
              return;
            }
            onHecho();
            showSuccess(`Confirmado: ${t.clienta}, mañana ${fmtTime(t.startsAt)}.`);
          } catch {
            showError("No se pudo confirmar. Probá de nuevo.");
          }
        })
      }
    >
      {ETIQUETA_RESPUESTA.confirmo.tecla}
    </Button>
  );
}

/**
 * La lista entera de mañana (la app «Confirmar turnos de mañana»). `detalle` trae cada turno como lo
 * ve la agenda (con la plata y el veredicto de cobro): lo usan mover y cancelar. Sin él, esas dos
 * teclas no se ofrecen (la lista sigue avisando y confirmando como siempre).
 */
export function ListaDeManana({
  dia,
  turnos,
  detalle = {},
  cobra = false,
}: {
  dia: string;
  turnos: TurnoAConfirmar[];
  detalle?: Readonly<Record<string, TurnoDelDia>>;
  /** ¿Quien mira cobra turnos? (agenda:collect; además, el veredicto de cada uno): puede devolver una seña. */
  cobra?: boolean;
}) {
  const router = useRouter();
  const { avisadas, avisar, error } = useAvisar();
  const [abierta, setAbierta] = useState(false);
  const [respuestas, setRespuestas] = useState<Record<string, Respuesta>>({});
  // Los turnos que se vieron al abrir: una que canceló o se movió sigue en la lista y en el contador.
  const [vistos] = useState(() => turnos);
  const [cambiar, setCambiar] = useState<string | null>(null);
  // El «ahora» de Mover (los huecos que ya pasaron no se ofrecen): se toma al abrir la hoja.
  const [ahoraDeLaHoja, setAhoraDeLaHoja] = useState(() => new Date().toISOString());
  const [cancelar, setCancelar] = useState<{ id: string; ahora: Date } | null>(null);
  const todos = unirTurnos(vistos, turnos).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const responder = (id: string, r: Respuesta) => setRespuestas((x) => ({ ...x, [id]: r }));
  const contador = contarManana(todos, avisadas, respuestas);
  const sinAvisar = todos.filter((t) => !t.avisadaEl && !avisadas[t.id]).length;
  const aCambiar = cambiar ? todos.find((t) => t.id === cambiar) : undefined;
  const turnoACambiar = cambiar ? detalle[cambiar] : undefined;
  const turnoACancelar = cancelar ? (detalle[cancelar.id] ?? null) : null;

  return (
    <div>
      <p role="status" aria-live="polite" className="mb-3 text-sm font-medium tabular-nums text-strong">
        {textoDelContador(contador)}
        <span className="font-normal text-muted"> · de {todos.length === 1 ? "1 turno" : `${todos.length} turnos`}</span>
      </p>
      {sinAvisar > 1 && (
        <div className="mb-4">
          <Button type="button" onClick={() => setAbierta(true)}>
            Avisar a las {sinAvisar}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      )}
      <ol aria-label={`Turnos de mañana, ${fechaLarga(dia)}`} className="border-t border-line-strong">
        {todos.map((t) => {
          const avisadaEl = avisadas[t.id] ?? t.avisadaEl;
          const wa = waLinkClienta(t.telefono, t.texto);
          const respuesta = respuestas[t.id] ?? null;
          const dicho = respuestaDe(t, respuestas);
          const teclas = teclasDeRespuesta(t, respuestas).filter((r) => r === "confirmo" || detalle[t.id]);
          const fuera = respuesta === "cancela";
          return (
            <Renglon
              as="li"
              key={t.id}
              folio={<span className={`text-[15px] font-semibold tabular-nums text-strong ${fuera ? "line-through" : ""}`}>{fmtTime(t.startsAt)}</span>}
              titulo={
                <Link
                  href={`/admin/turnos?date=${dia}&turno=${encodeURIComponent(t.id)}`}
                  aria-label={`${t.clienta}, mañana ${fmtTime(t.startsAt)}: abrir el turno`}
                  className="inline-flex min-h-11 items-center underline-offset-2 hover:underline lg:min-h-0"
                >
                  {t.clienta}
                </Link>
              }
              detalle={
                <>
                  {t.servicio} · {t.profesional}{" "}
                  {dicho ? (
                    <Marca tipo={MARCA_RESPUESTA[dicho]}>{ETIQUETA_RESPUESTA[dicho].hecho}</Marca>
                  ) : (
                    <Marca tipo="pendiente">Reservado</Marca>
                  )}
                  {avisadaEl && <span className="ml-2">avisada {fmtTime(avisadaEl)}</span>}
                  {!wa && (
                    <>
                      {" · "}
                      <Link href={`/admin/clientes/${encodeURIComponent(t.clientId)}`} className="font-medium text-warning underline">
                        el teléfono no es un celular: corregilo
                      </Link>
                    </>
                  )}
                </>
              }
              tecla={
                <>
                  {wa && !fuera && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${avisadaEl ? "WhatsApp de nuevo" : "WhatsApp"} a ${t.clienta}`}
                      data-ui="button"
                      data-variant={avisadaEl ? "ghost" : "outline"}
                      data-size="sm"
                      className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-3 text-sm font-medium"
                      onClick={() => void avisar(t)}
                    >
                      {avisadaEl ? "De nuevo" : "WhatsApp"}
                    </a>
                  )}
                  {teclas.length > 0 && (
                    <span role="group" aria-label={`Qué respondió ${t.clienta}`} className="inline-flex flex-wrap gap-2">
                      {teclas.map((r) =>
                        r === "confirmo" ? (
                          <TeclaConfirmo key={r} t={t} onHecho={() => responder(t.id, "confirmo")} />
                        ) : (
                          <Button
                            key={r}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (r === "cambia") {
                                responder(t.id, "cambia");
                                setAhoraDeLaHoja(new Date().toISOString());
                                setCambiar(t.id);
                              } else {
                                setCancelar({ id: t.id, ahora: new Date() });
                              }
                            }}
                          >
                            {ETIQUETA_RESPUESTA[r].tecla}
                          </Button>
                        ),
                      )}
                    </span>
                  )}
                </>
              }
            />
          );
        })}
      </ol>
      {abierta && (
        <Avisador
          dia={dia}
          turnos={todos.filter((t) => !avisadas[t.id] && respuestas[t.id] !== "cancela")}
          abierta={abierta}
          onCerrar={() => setAbierta(false)}
          onConfirmo={(id) => responder(id, "confirmo")}
        />
      )}
      {/* [Quiere cambiar]: Mover (2-C) — chips de días con huecos + [Mover y avisar por WhatsApp]. */}
      <Hoja
        abierta={!!aCambiar}
        onCerrar={() => setCambiar(null)}
        titulo={aCambiar ? `Cambiar el turno · ${aCambiar.clienta}` : ""}
        descripcion={aCambiar ? `Mañana ${fmtTime(aCambiar.startsAt)} · ${aCambiar.servicio} · ${aCambiar.profesional}` : undefined}
      >
        {aCambiar && turnoACambiar && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted">Elegí el día y la hora nuevos: «Mover y avisar» le manda el WhatsApp con el cambio.</p>
            <MoverTurno
              key={aCambiar.id}
              turno={turnoACambiar}
              ahora={ahoraDeLaHoja}
              abiertoAlEmpezar
              onListo={(movido) => {
                setCambiar(null);
                if (movido) router.refresh();
              }}
            />
          </div>
        )}
      </Hoja>
      <CancelarONoVino
        turno={turnoACancelar}
        accion="cancelar"
        ahora={cancelar?.ahora ?? new Date(0)}
        puedeDevolver={cobra && (turnoACancelar?.veredicto.ok ?? false)}
        onCerrar={() => setCancelar(null)}
        onListo={() => {
          if (cancelar) responder(cancelar.id, "cancela");
          setCancelar(null);
          router.refresh();
        }}
      />
    </div>
  );
}
