"use client";

// Congelar y reabrir el mes.
//
// Igual que LibroForms.tsx y CierreForm.tsx, NO usan `useActionState`: el QA de recorrido
// midió que por ese camino una parte de los guardados quedaba colgada en "Guardando…" con la
// fila escrita en la base. Acá la action se invoca directo y se espera su promesa; el mensaje
// y el refresco salen de ese `await`.
//
// Congelar pide CONFIRMACIÓN (es de lo poco irreversible del día a día: reabrir exige a la
// dueña y un motivo). Si quedan pasos pendientes, además hay que tildar que se congela igual;
// el servidor lo vuelve a exigir, no se confía en la casilla.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Textarea } from "@/components/ui";
import { congelarMesAction, reabrirMesAction, type EstadoAccionCierre } from "@/lib/cierre-mes/acciones";

function Mensaje({ state }: { state: EstadoAccionCierre }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p role="status" aria-live="polite" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
        {state.mensaje}
      </p>
    );
  }
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {state.error}
    </p>
  );
}

export function CongelarMes({
  mes,
  etiqueta,
  bloqueo,
  pendientes,
}: {
  mes: string;
  /** "Agosto 2026". */
  etiqueta: string;
  /** Si un paso no deja congelar (días sin cerrar), qué falta. */
  bloqueo: string | null;
  /** Los títulos de los pasos pendientes que no bloquean. */
  pendientes: string[];
}) {
  const router = useRouter();
  const [state, setState] = useState<EstadoAccionCierre>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aceptaPendientes, setAceptaPendientes] = useState(false);
  const [pending, startTransition] = useTransition();

  const congelar = () => {
    const fd = new FormData();
    fd.set("mes", mes);
    if (aceptaPendientes) fd.set("confirmo", "1");
    startTransition(async () => {
      try {
        const r = await congelarMesAction(null, fd);
        setState(r);
        if (r?.ok) {
          setConfirmando(false);
          router.refresh();
        }
      } catch {
        setState({ ok: false, error: "No llegó la respuesta (problema de conexión). Actualizá la página para ver si el mes quedó congelado antes de volver a intentar." });
      }
    });
  };

  return (
    <section aria-labelledby="congelar-titulo" className="rounded-xl border border-line bg-surface-raised p-4 shadow-card sm:p-5">
      <h2 id="congelar-titulo" className="text-base font-semibold text-strong">
        Congelar {etiqueta}
      </h2>
      {bloqueo ? (
        <p className="mt-1 text-sm text-body">
          Todavía no se puede. {bloqueo} Cerrá esos días desde el paso 1 y volvé.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-body">
            Congelado el mes, el paquete que baja tu contador es la versión final. Si después hay que corregir algo, la
            dueña o el dueño lo puede reabrir con un motivo.
          </p>
          {pendientes.length > 0 && (
            <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-sm text-body">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={aceptaPendientes}
                onChange={(e) => setAceptaPendientes(e.target.checked)}
              />
              <span>
                Congelar igual, con {pendientes.length === 1 ? "un paso pendiente" : `${pendientes.length} pasos pendientes`}:{" "}
                {pendientes.join(", ")}. Queda anotado cuáles eran.
              </span>
            </label>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {confirmando ? (
              <>
                <Button
                  size="md"
                  disabled={pending || (pendientes.length > 0 && !aceptaPendientes)}
                  onClick={congelar}
                >
                  {pending ? "Congelando…" : `Sí, congelar ${etiqueta}`}
                </Button>
                <Button size="md" variant="ghost" disabled={pending} onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button
                size="md"
                disabled={pendientes.length > 0 && !aceptaPendientes}
                onClick={() => {
                  setState(null);
                  setConfirmando(true);
                }}
              >
                Congelar {etiqueta}
              </Button>
            )}
          </div>
        </>
      )}
      <div className="mt-3">
        <Mensaje state={state} />
      </div>
    </section>
  );
}

export function ReabrirMes({ mes, etiqueta, puedeReabrir }: { mes: string; etiqueta: string; puedeReabrir: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<EstadoAccionCierre>(null);
  const [motivo, setMotivo] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!puedeReabrir) {
    return (
      <p className="rounded-xl border border-line bg-surface-raised p-4 text-sm text-body">
        Para reabrir {etiqueta} hace falta la dueña o el dueño del negocio: pedíselo con el motivo.
      </p>
    );
  }

  const reabrir = () => {
    const fd = new FormData();
    fd.set("mes", mes);
    fd.set("motivo", motivo);
    startTransition(async () => {
      try {
        const r = await reabrirMesAction(null, fd);
        setState(r);
        if (r?.ok) {
          setAbierto(false);
          setMotivo("");
          router.refresh();
        }
      } catch {
        setState({ ok: false, error: "No llegó la respuesta (problema de conexión). Actualizá la página para ver si el mes quedó abierto antes de volver a intentar." });
      }
    });
  };

  return (
    <section aria-labelledby="reabrir-titulo" className="rounded-xl border border-line bg-surface-raised p-4 shadow-card sm:p-5">
      <h2 id="reabrir-titulo" className="text-base font-semibold text-strong">
        ¿Hay que corregir algo de {etiqueta}?
      </h2>
      <p className="mt-1 text-sm text-body">
        Reabrir el mes no reabre la caja: los días siguen cerrados y una corrección de plata va con la fecha de hoy. El
        motivo queda en la auditoría y lo ve tu contador.
      </p>
      {abierto ? (
        <div className="mt-3 space-y-3">
          <Field label="Por qué lo reabrís" htmlFor="motivo-reapertura">
            <Textarea
              id="motivo-reapertura"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: faltaba cargar la factura de compra del frigorífico del 28."
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="md" variant="danger" disabled={pending || motivo.trim().length === 0} onClick={reabrir}>
              {pending ? "Reabriendo…" : `Reabrir ${etiqueta}`}
            </Button>
            <Button size="md" variant="ghost" disabled={pending} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button
            size="md"
            variant="outline"
            onClick={() => {
              setState(null);
              setAbierto(true);
            }}
          >
            Reabrir {etiqueta}
          </Button>
        </div>
      )}
      <div className="mt-3">
        <Mensaje state={state} />
      </div>
    </section>
  );
}
