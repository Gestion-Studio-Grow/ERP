"use client";

// Las acciones de un toque sobre una clase. Pensadas para usarse entre clase y clase con el
// celular en la mano: botones de 48 px, lo importante a la izquierda, y después de cada acción
// que le cambia algo al alumno, el botón verde para avisarle por WhatsApp con el texto listo
// (en la barra de abajo, _aviso.tsx).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { agendarProxima, mandarLinkAlAlumno, moverClase, moverPago, recordatorio } from "@/lib/padel/acciones";
import type { EventoClase } from "@/lib/padel/core";
import { useAvisoAccion } from "./_aviso";

type Resultado = { ok: true; wa?: string | null; enviado?: boolean; cuando?: string } | { ok: false; error: string };

export interface ClaseAcciones {
  id: string;
  estado: string;
  pagoEstado: string;
  nombre: string;
  comprobante: string | null;
  precio: number;
}

/**
 * Corre la acción. El error se muestra en la tarjeta (no cambió nada, sigue ahí); el resultado
 * y el WhatsApp van a la barra de abajo del layout, que sobrevive al refresco de la lista.
 */
function useAccion(nombre: string) {
  const router = useRouter();
  const mostrar = useAvisoAccion();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const correr = (fn: () => Promise<Resultado>, listo: string) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      mostrar({ texto: r.cuando ? `${listo}: ${r.cuando}` : listo, wa: r.wa, enviado: r.enviado, nombre });
      router.refresh();
    });
  return { pendiente, error, correr };
}

function ErrorAccion({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p role="alert" className="mt-2 rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{texto}</p>;
}

const grande = (variant: "solid" | "outline" | "ghost" | "danger" = "solid") => cn(buttonClasses(variant, "lg"), "h-12 w-full justify-center px-3");

export function AccionesClase({ c, conProxima = true }: { c: ClaseAcciones; conProxima?: boolean }) {
  const { pendiente, error, correr } = useAccion(c.nombre);
  const [verComprobante, setVerComprobante] = useState(false);
  const [seguro, setSeguro] = useState(false);
  const mover = (e: EventoClase, listo: string) => correr(() => moverClase(c.id, e), listo);
  const debe = c.pagoEstado !== "PAGADO" && ["CONFIRMADA", "DADA"].includes(c.estado);

  return (
    <div className="grid gap-2" aria-busy={pendiente}>
      {c.estado === "PEDIDA" && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={pendiente} className={grande()} onClick={() => mover("confirmar", "Confirmada")} data-qa="confirmar">Confirmar</button>
          <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => mover("rechazar", "Rechazada")} data-qa="rechazar">No puedo</button>
        </div>
      )}

      {c.estado === "CONFIRMADA" && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={pendiente} className={grande()} onClick={() => mover("dar", "Clase dada")} data-qa="dada">Dada</button>
          <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => mover("ausente", "Quedó como ausente")} data-qa="ausente">No vino</button>
        </div>
      )}

      {c.pagoEstado === "EN_REVISION" && (
        <div className="grid gap-2 rounded-xl border border-line p-2" style={{ background: "var(--warning-soft)" }}>
          {c.comprobante && (
            <button type="button" className="h-11 text-left text-sm font-semibold text-strong underline" onClick={() => setVerComprobante((v) => !v)} aria-expanded={verComprobante} data-qa="ver-comprobante">
              {verComprobante ? "Ocultar comprobante" : "Ver comprobante"}
            </button>
          )}
          {c.comprobante && verComprobante && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.comprobante} alt={`Comprobante de ${c.nombre}`} className="max-h-96 w-full rounded-lg object-contain" style={{ background: "var(--surface-raised)" }} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={pendiente} className={grande()} onClick={() => correr(() => moverPago(c.id, "validar"), "Pago validado")} data-qa="validar">Está bien</button>
            <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => correr(() => moverPago(c.id, "noValido"), "Le pediste otro comprobante")} data-qa="no-valido">No es válido</button>
          </div>
        </div>
      )}

      {debe && c.pagoEstado === "PENDIENTE" && (
        <button type="button" disabled={pendiente} className={grande("outline")} onClick={() => correr(() => moverPago(c.id, "efectivo"), "Cobrada en efectivo")} data-qa="efectivo">
          Cobré en efectivo
        </button>
      )}

      {conProxima && ["CONFIRMADA", "DADA"].includes(c.estado) && (
        <button type="button" disabled={pendiente} className={grande("ghost")} onClick={() => correr(() => agendarProxima(c.id), "Próxima agendada")} data-qa="agendar-proxima">
          + Agendar la próxima (misma hora)
        </button>
      )}

      {["PEDIDA", "CONFIRMADA"].includes(c.estado) && (
        seguro ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={grande("outline")} onClick={() => setSeguro(false)}>No</button>
            <button type="button" disabled={pendiente} className={grande("danger")} onClick={() => mover("cancelar", "Cancelada")} data-qa="cancelar-si">Sí, cancelar</button>
          </div>
        ) : (
          <button type="button" className="h-11 text-sm text-muted underline" onClick={() => setSeguro(true)} data-qa="cancelar">Cancelar la clase</button>
        )
      )}

      <ErrorAccion texto={error} />
    </div>
  );
}

/** Para las clases de mañana: el recordatorio con un toque. */
export function BotonRecordatorio({ id, nombre }: { id: string; nombre: string }) {
  const { pendiente, error, correr } = useAccion(nombre);
  return (
    <div>
      <button type="button" disabled={pendiente} className={cn(buttonClasses("outline", "sm"), "w-full")} onClick={() => correr(() => recordatorio(id), "Recordatorio listo")}>
        Recordarle
      </button>
      <ErrorAccion texto={error} />
    </div>
  );
}

/** Mandarle su link al alumno (la primera vez, o si lo perdió). */
export function BotonLink({ alumnoId, nombre }: { alumnoId: string; nombre: string }) {
  const { pendiente, error, correr } = useAccion(nombre);
  return (
    <div>
      <button type="button" disabled={pendiente} className={cn(buttonClasses("outline", "sm"), "w-full")} onClick={() => correr(() => mandarLinkAlAlumno(alumnoId), "Link listo")} data-qa="mandar-link">
        Mandarle su link
      </button>
      <ErrorAccion texto={error} />
    </div>
  );
}
