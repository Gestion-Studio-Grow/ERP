"use client";

// HOJA «CANCELAR» y «NO PUEDO» (M-061 · M-043 · §2.3). Nada se cancela con un toque suelto
// (principio 4): primero el motivo en chips, después —si estaba pagada— «Queda $ 25.000 a favor
// de Juan», después «¿Le ofrecés otro horario?» (hasta 3 libres cercanos) y recién ahí «Cancelar y
// avisar». En un PEDIDO es «No puedo»: lo que importa es ofrecerle otra hora para no perder la
// clase (E12); el motivo no hace falta.

import { useEffect, useId, useState } from "react";
import { Chip, Esqueleto, Plata } from "@/components/ui";
import { alternativasPara, cancelarConMotivo } from "@/lib/padel/acciones";
import { diaHoraCorta, type MotivoCancel } from "@/lib/padel/core";
import { primerNombre } from "../_cola";
import { ErrorAccion, HojaPanel, Pie, Rotulo, chip48, grande, useAccion } from "./comun";
import { MOTIVOS_CHIP, alternarHorario } from "./proponer";
import type { ClaseAcciones } from "./tipos";

export function HojaCancelar({ c, onCerrar }: { c: ClaseAcciones; onCerrar: () => void }) {
  const { pendiente, error, correr } = useAccion(c.nombre);
  const esPedido = c.estado === "PEDIDA";
  const nombre = primerNombre(c.nombre);
  const [motivo, setMotivo] = useState<MotivoCancel | null>(esPedido ? "OTRO" : null);
  const [opciones, setOpciones] = useState<string[] | null>(null);
  const [ofrecer, setOfrecer] = useState<string[]>([]);
  const idMotivo = useId();
  const idOfrecer = useId();

  useEffect(() => {
    let vigente = true;
    alternativasPara(c.id)
      .then((r) => vigente && setOpciones(r.ok ? r.alternativas : []))
      .catch(() => vigente && setOpciones([]));
    return () => {
      vigente = false;
    };
  }, [c.id]);

  const confirmar = () => {
    if (!motivo) return;
    correr(() => cancelarConMotivo(c.id, motivo, ofrecer), esPedido ? "Le dijiste que no podés" : "Cancelada", onCerrar);
  };

  const etiquetaBoton = pendiente
    ? "Avisando…"
    : !motivo
      ? "Elegí el motivo"
      : esPedido
        ? ofrecer.length ? `No puedo · ofrecerle ${ofrecer.length === 1 ? "otro" : ofrecer.length}` : "No puedo y avisar"
        : "Cancelar y avisar";

  return (
    <HojaPanel
      onCerrar={onCerrar}
      titulo={esPedido ? `¿No podés con ${nombre}?` : `Cancelar la clase de ${nombre}`}
      descripcion={c.empiezaEn ? diaHoraCorta(new Date(c.empiezaEn)) : undefined}
      pie={
        <Pie>
          <button type="button" disabled={!motivo || pendiente} onClick={confirmar} className={grande(esPedido ? "solid" : "danger")} data-qa="cancelar-y-avisar">
            {etiquetaBoton}
          </button>
        </Pie>
      }
    >
      {!esPedido && (
        <>
          <Rotulo id={idMotivo}>¿Por qué?</Rotulo>
          <div role="group" aria-labelledby={idMotivo} className="flex flex-wrap gap-2" data-qa="motivos">
            {MOTIVOS_CHIP.map((m) => (
              <Chip key={m.valor} prendido={motivo === m.valor} onClick={() => setMotivo(m.valor)} className={chip48}>
                {m.etiqueta}
              </Chip>
            ))}
          </div>
        </>
      )}

      {c.pagoEstado === "PAGADO" && c.precio > 0 && (
        <p role="status" className="mt-4 rounded-xl bg-success-soft px-3 py-2 text-sm text-strong" data-qa="queda-a-favor">
          Ya estaba pagada: quedan <Plata valor={c.precio} sinCentavos /> a favor de {nombre} para la próxima.
        </p>
      )}

      <Rotulo id={idOfrecer}>
        ¿Le ofrecés otro horario? <span className="font-normal text-muted">(opcional, hasta 3)</span>
      </Rotulo>
      {opciones === null ? (
        <div className="flex gap-2" aria-busy="true">
          <span className="sr-only">Buscando horarios libres cerca…</span>
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-12 w-32 rounded-full" />
          ))}
        </div>
      ) : opciones.length === 0 ? (
        <p className="text-sm text-muted">No tenés horarios libres cerca. Le llega el link de tu turnero para que elija.</p>
      ) : (
        <div role="group" aria-labelledby={idOfrecer} className="flex flex-wrap gap-2" data-qa="alternativas">
          {opciones.map((iso) => (
            <Chip key={iso} prendido={ofrecer.includes(iso)} onClick={() => setOfrecer((e) => alternarHorario(e, iso))} className={chip48}>
              {diaHoraCorta(new Date(iso))}
            </Chip>
          ))}
        </div>
      )}
      {ofrecer.length > 0 && <p className="mt-2 text-sm text-muted">El WhatsApp le pregunta si le sirve y trae el link para pedirlo con un toque.</p>}
      <ErrorAccion texto={error} className="mt-3" />
    </HojaPanel>
  );
}
