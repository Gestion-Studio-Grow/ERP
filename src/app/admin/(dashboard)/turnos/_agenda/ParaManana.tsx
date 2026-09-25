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
// La lista entera (con «Confirmar» para las reservadas) es la app «Confirmar turnos de mañana»
// (turnos/manana), que usa `ListaDeManana` de acá.

import { useState, useTransition } from "react";
import Link from "next/link";
import { confirmarTurno, marcarAvisada, type TurnoAConfirmar } from "@/lib/actions";
import { Button, Hoja, Marca, Renglon } from "@/components/ui";
import { fmtTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { useToast } from "../../ToastProvider";
import { fechaLarga } from "../agenda-core";
import { aFormData, camposDelTurno } from "./campos";

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

function ConfirmarUno({ t }: { t: TurnoAConfirmar }) {
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
            await confirmarTurno(aFormData(camposDelTurno(t.id)));
            setHecho(true);
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
function Avisador({ dia, turnos, abierta, onCerrar }: { dia: string; turnos: TurnoAConfirmar[]; abierta: boolean; onCerrar: () => void }) {
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
            <ConfirmarUno t={t} />
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

/** La lista entera de mañana (la app «Confirmar turnos de mañana»). */
export function ListaDeManana({ dia, turnos }: { dia: string; turnos: TurnoAConfirmar[] }) {
  const { avisadas, avisar, error } = useAvisar();
  const [abierta, setAbierta] = useState(false);
  const sinAvisar = turnos.filter((t) => !t.avisadaEl && !avisadas[t.id]).length;
  return (
    <div>
      {sinAvisar > 1 && (
        <div className="mb-4">
          <Button type="button" onClick={() => setAbierta(true)}>
            Avisar de a una ({sinAvisar})
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      )}
      <ol aria-label={`Turnos de mañana, ${fechaLarga(dia)}`} className="border-t border-line-strong">
        {turnos.map((t) => {
          const avisadaEl = avisadas[t.id] ?? t.avisadaEl;
          const wa = waLinkClienta(t.telefono, t.texto);
          return (
            <Renglon
              as="li"
              key={t.id}
              folio={<span className="text-[15px] font-semibold tabular-nums text-strong">{fmtTime(t.startsAt)}</span>}
              titulo={t.clienta}
              detalle={
                <>
                  {t.servicio} · {t.profesional}{" "}
                  <Marca tipo={t.status === "PENDING" ? "pendiente" : "hecho"}>{t.status === "PENDING" ? "Reservado" : "Confirmado"}</Marca>
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
                  <ConfirmarUno t={t} />
                  {wa && (
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
                </>
              }
            />
          );
        })}
      </ol>
      {abierta && <Avisador dia={dia} turnos={turnos.filter((t) => !avisadas[t.id])} abierta={abierta} onCerrar={() => setAbierta(false)} />}
    </div>
  );
}
