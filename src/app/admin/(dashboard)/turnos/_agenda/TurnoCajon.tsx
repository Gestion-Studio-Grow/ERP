"use client";

// ============================================================================
// EL CAJÓN DEL TURNO — todo lo de un turno en un solo lugar («Renglón»).
// ============================================================================
//
// El renglón de la agenda ofrece UNA tecla. Todo lo demás del turno vive acá, en el orden en que
// se lo necesita: quién es (y su WhatsApp), qué se hace ahora (cobrar, terminar, confirmar), la
// plata (precio, lo que entró, lo dado de baja, lo que falta), los cobros con su anulación, y al
// pie lo que casi nunca se toca (reprogramar, no vino, cancelar, dar de baja el saldo).
//
// PC: cajón de 480 px a la derecha, con la agenda a la vista. Celular: sube como hoja.
// Cada acción es la de siempre, con los mismos campos y las mismas guardias (campos.ts). Lo que
// mueve plata hacia atrás pide motivo, en dos pasos, como la fila de siempre.

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  anularCobroTurno,
  cancelAppointment,
  condonarSaldoTurno,
  confirmarTurno,
  markNoShow,
  type ResultadoAccion,
} from "@/lib/actions";
import { Cajon } from "@/components/ui/Cajon";
import { Button, Input, Marca, Plata, Renglon, Seccion } from "@/components/ui";
import { fmtTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";
import {
  claseDeCobro,
  cobrosAnulables,
  MOTIVO_MIN,
} from "@/lib/turnos/anulacion";
import { useToast } from "../../ToastProvider";
import RescheduleForm from "../RescheduleForm";
import {
  marcaDelTurno,
  minutosEntre,
  pasoDelTurno,
  yaEmpezo,
  type Permisos,
  type TurnoDelDia,
} from "../agenda-core";
import {
  aFormData,
  camposDeAnular,
  camposDeCondonar,
  camposDelTurno,
} from "./campos";
import CobrarTurno from "./CobrarTurno";
import TerminarTurno from "./TerminarTurno";

function ConMotivo({
  etiqueta,
  pregunta,
  verbo,
  placeholder,
  peligro = true,
  hacer,
}: {
  etiqueta: string;
  pregunta: string;
  verbo: string;
  placeholder: string;
  peligro?: boolean;
  hacer: (motivo: string) => Promise<ResultadoAccion>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  if (!abierto) {
    return (
      <Button
        type="button"
        variant={peligro ? "danger" : "outline"}
        size="sm"
        onClick={() => setAbierto(true)}
      >
        {etiqueta}
      </Button>
    );
  }
  const corto = motivo.trim().length < MOTIVO_MIN;
  return (
    <div
      role="group"
      aria-label={pregunta}
      className="w-full space-y-2 border-l-2 border-line-strong pl-3"
    >
      <p className="text-sm font-medium text-strong">{pregunta}</p>
      <Input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder={placeholder}
        aria-label="Motivo"
        maxLength={200}
        autoFocus
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={peligro ? "danger" : "solid"}
          size="sm"
          disabled={corto || pendiente}
          estado={pendiente ? "cargando" : undefined}
          onClick={() =>
            empezar(async () => {
              setError("");
              try {
                const r = await hacer(motivo);
                if (!r.ok) setError(r.error);
                else {
                  setAbierto(false);
                  setMotivo("");
                }
              } catch {
                setError("No se pudo. Probá de nuevo; si sigue, avisá.");
              }
            })
          }
        >
          {verbo}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAbierto(false)}
        >
          No
        </Button>
      </div>
      {corto && (
        <p className="text-xs text-muted">
          Escribí el motivo (al menos {MOTIVO_MIN} letras): es lo que explica la
          caja dentro de seis meses.
        </p>
      )}
    </div>
  );
}

/** Una acción de un solo toque que no devuelve resultado (confirmar, no vino, cancelar). */
function useAccionSimple() {
  const { showError, showSuccess } = useToast();
  const [pendiente, empezar] = useTransition();
  const correr = (
    accion: (fd: FormData) => Promise<unknown>,
    turnoId: string,
    ok: string,
    onListo?: () => void,
  ) =>
    empezar(async () => {
      try {
        await accion(aFormData(camposDelTurno(turnoId)));
        showSuccess(ok);
        onListo?.();
      } catch (e) {
        // markNoShow tira un Error con la frase del servidor; en producción llega sin mensaje.
        const m =
          e instanceof Error && e.message && e.message.length < 200
            ? e.message
            : "No se pudo. Probá de nuevo; si sigue, avisá.";
        showError(m);
      }
    });
  return { pendiente, correr };
}

export default function TurnoCajon({
  turno,
  permisos,
  ahora,
  hrefFicha,
  onCerrar,
}: {
  turno: TurnoDelDia | null;
  permisos: Permisos;
  /** ISO del «ahora» de la carga (el mismo de la agenda: un turno no cambia de estado entre los dos). */
  ahora: string;
  /** La ficha de la clienta, si quien mira puede abrir Clientes. */
  hrefFicha: ((clienteId: string) => string) | null;
  onCerrar: () => void;
}) {
  const reloj = new Date(ahora);
  const { pendiente, correr } = useAccionSimple();
  const [cancelando, setCancelando] = useState(false);
  const t = turno;
  if (!t) return null;

  const paso = pasoDelTurno(t, permisos, reloj);
  const marca = marcaDelTurno(t, reloj);
  const wa = waLinkClienta(t.telefono);
  const vivo = t.estado === "PENDING" || t.estado === "CONFIRMED";
  const cobraEste = permisos.cobrar && t.veredicto.ok;
  const anulables = new Set(
    cobrosAnulables(t.cobros.map((c) => ({ ...c, note: c.note ?? null }))).map(
      (c) => c.id,
    ),
  );
  // Cobrar (un parcial, la seña, el saldo) cuando falta plata y el turno lo acepta, y no es ya la
  // tecla de «Terminar» (que cobra el saldo al terminar).
  const noVino =
    t.estado === "CONFIRMED" && yaEmpezo(t, reloj) && permisos.terminar;
  const hayOtras = (permisos.gestionar && (vivo || t.cuentaACobrar)) || noVino;
  const ofreceCobro =
    cobraEste &&
    t.saldo > 0 &&
    t.estado !== "NO_SHOW" &&
    t.estado !== "CANCELLED" &&
    paso.tipo !== "terminar";

  return (
    <Cajon
      abierto
      onCerrar={onCerrar}
      titulo={
        <>
          <span className="tabular-nums">{fmtTime(t.inicio)}</span> ·{" "}
          {t.clienta}
        </>
      }
      descripcion={`${t.servicio} · ${minutosEntre(t.inicio, t.fin)}′ · ${t.profesional}${t.box ? ` · ${t.box}` : ""}`}
    >
      <div className="space-y-6">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Marca tipo={marca.tipo}>{marca.texto}</Marca>
          {t.avisadaEl && (
            <span className="text-sm text-muted">
              avisada {fmtTime(t.avisadaEl)}
            </span>
          )}
        </p>

        <Seccion titulo="La clienta">
          <Renglon
            folio="Teléfono"
            titulo={
              wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:underline"
                  aria-label={`WhatsApp a ${t.clienta}: ${t.telefono}`}
                >
                  {t.telefono} · WhatsApp
                </a>
              ) : (
                <span>{t.telefono}</span>
              )
            }
            detalle={
              wa
                ? undefined
                : "No es un celular válido: corregilo en su ficha para escribirle."
            }
            tecla={
              hrefFicha ? (
                <Link
                  href={hrefFicha(t.clienteId)}
                  data-ui="button"
                  data-variant="ghost"
                  data-size="sm"
                  className="inline-flex min-h-11 items-center px-3 text-sm"
                >
                  Ver su ficha
                </Link>
              ) : undefined
            }
          />
          {t.notas && (
            <Renglon
              folio="Notas"
              titulo={
                <span className="whitespace-pre-line font-normal">
                  {t.notas}
                </span>
              }
            />
          )}
        </Seccion>

        {paso.tipo === "confirmar" && (
          <Seccion titulo="Qué falta">
            <div className="space-y-2 pt-3">
              <p className="text-sm text-muted">
                Está reservado. Confirmalo cuando la clienta te diga que viene.
              </p>
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={pendiente}
                estado={pendiente ? "cargando" : undefined}
                onClick={() =>
                  correr(
                    confirmarTurno,
                    t.id,
                    `Confirmado: ${t.clienta}, ${fmtTime(t.inicio)}.`,
                  )
                }
              >
                Confirmar el turno
              </Button>
            </div>
          </Seccion>
        )}

        {paso.tipo === "terminar" && (
          <Seccion titulo="Terminar">
            <div className="pt-3">
              <TerminarTurno
                turnoId={t.id}
                clienta={t.clienta}
                saldo={t.saldo}
                puedeCobrar={cobraEste}
                motivoSinCobro={t.veredicto.ok ? undefined : t.veredicto.motivo}
                onListo={onCerrar}
              />
            </div>
          </Seccion>
        )}

        {ofreceCobro && (
          <Seccion
            titulo={t.sugerido.tipo === "senia" ? "Cobrar la seña" : "Cobrar"}
          >
            <div className="pt-3">
              <CobrarTurno
                turnoId={t.id}
                clienta={t.clienta}
                sugerido={t.sugerido}
                saldo={t.saldo}
              />
            </div>
          </Seccion>
        )}

        {!t.veredicto.ok && t.saldo > 0 && paso.tipo !== "terminar" && (
          <p className="text-sm text-muted">
            {t.veredicto.motivo} Quedan <Plata valor={t.saldo} /> a cobrar.
          </p>
        )}

        <Seccion titulo="La plata">
          <Renglon
            folio="Precio"
            titulo="Del servicio, al reservar"
            plata={<Plata valor={t.precio} />}
          />
          <Renglon
            folio="Entró"
            titulo={
              t.cobrado > 0 ? "Lo cobrado hasta ahora" : "Todavía no entró nada"
            }
            plata={
              <Plata
                valor={t.cobrado}
                tono={t.cobrado > 0 ? "cobrado" : undefined}
              />
            }
          />
          {t.condonado > 0 && (
            <Renglon
              folio="De baja"
              titulo="Saldo que no se va a cobrar (no es plata que entró)"
              plata={<Plata valor={t.condonado} />}
            />
          )}
          <Renglon
            folio="Falta"
            titulo={
              t.saldo > 0
                ? t.cuentaACobrar
                  ? "Se prestó y todavía se debe"
                  : "Lo que falta para saldar el servicio"
                : "Saldado"
            }
            plata={
              <Plata
                valor={t.saldo}
                tono={t.cuentaACobrar ? "peligro" : undefined}
              />
            }
          />
        </Seccion>

        {t.cobros.length > 0 && (
          <Seccion titulo="Cobros" nota={t.cobros.length}>
            <ul>
              {t.cobros.map((c, i) => {
                const clase = claseDeCobro(c.note);
                const medio =
                  METODO_LABEL[c.method as MetodoDePago] ?? c.method;
                return (
                  <li key={c.id ?? i}>
                    <Renglon
                      folio={c.createdAt ? fmtTime(c.createdAt) : "—"}
                      titulo={
                        clase === "cobro"
                          ? medio
                          : clase === "anulacion"
                            ? "Anulación"
                            : "Saldo dado de baja"
                      }
                      detalle={
                        c.note && clase !== "cobro"
                          ? c.note.replace(/^[A-Z]+:\S*\s*—?\s*/, "")
                          : undefined
                      }
                      plata={
                        <Plata
                          valor={
                            clase === "anulacion"
                              ? -Math.abs(c.amount)
                              : c.amount
                          }
                        />
                      }
                      tecla={
                        clase === "cobro" &&
                        c.id &&
                        anulables.has(c.id) &&
                        cobraEste ? (
                          <ConMotivo
                            etiqueta="Anular"
                            pregunta={`¿Anular el cobro de ${medio.toLowerCase()}?`}
                            verbo="Sí, anular"
                            placeholder="Por qué (cobré por el medio equivocado…)"
                            hacer={(motivo) =>
                              anularCobroTurno(
                                aFormData(
                                  camposDeAnular({
                                    cobroId: c.id!,
                                    turnoId: t.id,
                                    motivo,
                                  }),
                                ),
                              )
                            }
                          />
                        ) : undefined
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </Seccion>
        )}

        {hayOtras && (
          <Seccion titulo="Otras acciones">
            <div className="flex flex-col items-start gap-3 pt-3">
              {permisos.gestionar && vivo && (
                <RescheduleForm
                  appointmentId={t.id}
                  serviceId={t.servicioId}
                  currentProfessionalId={t.profesionalId}
                />
              )}
              {noVino && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendiente}
                  onClick={() =>
                    correr(
                      markNoShow,
                      t.id,
                      `Marcado: ${t.clienta} no vino.`,
                      onCerrar,
                    )
                  }
                >
                  No vino
                </Button>
              )}
              {permisos.gestionar && t.cuentaACobrar && (
                <ConMotivo
                  etiqueta="Dar de baja el saldo"
                  pregunta="¿Dar de baja lo que falta? No mueve la caja: sólo deja de figurar como deuda."
                  verbo="Sí, dar de baja"
                  placeholder="Por qué no se cobra (descuento de la dueña, incobrable…)"
                  peligro={false}
                  hacer={(motivo) =>
                    condonarSaldoTurno(
                      aFormData(camposDeCondonar({ turnoId: t.id, motivo })),
                    )
                  }
                />
              )}
              {permisos.gestionar &&
                vivo &&
                (cancelando ? (
                  <div
                    role="group"
                    aria-label="Cancelar el turno"
                    className="w-full space-y-2 border-l-2 border-line-strong pl-3"
                  >
                    <p className="text-sm font-medium text-strong">
                      ¿Cancelar el turno de {t.clienta}? El horario queda libre.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={pendiente}
                        onClick={() =>
                          correr(
                            cancelAppointment,
                            t.id,
                            `Cancelado: ${t.clienta}, ${fmtTime(t.inicio)}.`,
                            onCerrar,
                          )
                        }
                      >
                        Sí, cancelar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelando(false)}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCancelando(true)}
                  >
                    Cancelar el turno
                  </Button>
                ))}
            </div>
          </Seccion>
        )}
      </div>
    </Cajon>
  );
}
