"use client";

// Un comprobante por revisar (Bandeja): «Está bien» lo valida; «No es válido» pide el motivo en
// chips (Monto distinto · No se ve · Otra cuenta · Otro) y el alumno lo ve en su link con ese
// texto, y puede mandar otro (devolverComprobante, M-076). En los dos casos, el WhatsApp al
// alumno queda listo en la cola.
//
// Un comprobante para varias clases (el alumno pagó todo junto, M-109) es UNA tarjeta: el profe lo
// mira una vez y la decisión vale para todas. Cada clase deja su aviso (la cola los muestra «1 de
// N»); si alguna cambió en el medio, se dice cuál y las demás quedan resueltas.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { devolverComprobante, moverPago } from "@/lib/padel/acciones";
import { MOTIVOS_COMPROBANTE, type MotivoComprobante } from "@/lib/padel/core";
import { chipEleccion } from "../config/_estilos";
import { useColaAvisos, type ItemAviso } from "../_aviso";
import { useToast } from "../../ToastProvider";
import { ErrorEnLinea } from "../alumnos/_usar-accion";

type R = { ok: true; wa: string | null; enviado: boolean; avisoId?: string | null } | { ok: false; error: string };

const MOTIVO_CORTO: Record<MotivoComprobante, string> = {
  MONTO: "Monto distinto",
  NO_SE_VE: "No se ve",
  OTRA_CUENTA: "Otra cuenta",
  OTRO: "Otro",
};

const grande = (v: "solid" | "outline" | "danger" = "outline") => cn(buttonClasses(v, "lg"), "h-12 w-full justify-center px-3");

export function RevisarComprobante({ claseIds, nombre }: { claseIds: string[]; nombre: string }) {
  const router = useRouter();
  const { encolar } = useColaAvisos();
  const { showSuccess } = useToast();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [motivos, setMotivos] = useState(false);
  const correr = (fn: (id: string) => Promise<R>, texto: string) =>
    start(async () => {
      setError(null);
      const avisos: ItemAviso[] = [];
      let fallas = 0;
      for (const id of claseIds) {
        const r = await fn(id).catch(() => ({ ok: false as const, error: "No pudimos guardar. Probá de nuevo." }));
        if (!r.ok) {
          fallas++;
          setError(r.error);
          continue;
        }
        avisos.push({ texto, nombre, wa: r.wa, enviado: r.enviado, avisoId: r.avisoId ?? null });
      }
      if (avisos.some((a) => a.wa || a.enviado)) encolar(avisos);
      else if (avisos.length) showSuccess(texto);
      if (fallas && avisos.length) setError(`${fallas} de ${claseIds.length} ya habían cambiado. Actualizá la pantalla.`);
      router.refresh();
    });
  return (
    <div className="grid gap-2" aria-busy={pendiente}>
      {motivos ? (
        <div role="group" aria-label="¿Por qué no es válido?" className="grid gap-2">
          <p className="text-sm font-semibold text-strong">¿Por qué no es válido?</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_COMPROBANTE.map((m) => (
              <button
                key={m}
                type="button"
                disabled={pendiente}
                className={chipEleccion}
                onClick={() => correr((id) => devolverComprobante(id, m), `Le pediste otro comprobante (${MOTIVO_CORTO[m].toLowerCase()})`)}
                data-qa={`motivo-${m.toLowerCase()}`}
              >
                {MOTIVO_CORTO[m]}
              </button>
            ))}
          </div>
          <button type="button" className="min-h-11 justify-self-start text-sm text-muted underline underline-offset-2" onClick={() => setMotivos(false)}>
            Volver
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={pendiente} className={grande("solid")} onClick={() => correr((id) => moverPago(id, "validar"), "Pago validado")} data-qa="validar">
            Está bien
          </button>
          <button type="button" disabled={pendiente} className={grande()} onClick={() => setMotivos(true)} data-qa="no-valido">
            No es válido
          </button>
        </div>
      )}
      <ErrorEnLinea texto={error} />
    </div>
  );
}
