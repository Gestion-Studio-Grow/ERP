"use client";

// Una fila de "Para contactar hoy": quién, por qué y el botón de WhatsApp con el texto listo.
// El molde es "Mañana: confirmar" (turnos/MananaConfirmar.tsx): un <a> de verdad que abre el
// chat en el mismo toque (sin bloqueo de ventanas emergentes) y, en paralelo, la constancia.
// La fila queda "contactada HH:MM" hasta recargar; al recargar ya no está (14 días afuera).
//
// Sin imports de valor de Prisma: es un componente cliente. Las fechas llegan como ISO.

import { useState } from "react";
import Link from "next/link";
import { registrarContacto } from "@/lib/crm-actions";
import { cn } from "@/components/ui";
import { fmtTime } from "@/lib/datetime";
import { MOTIVO_ETIQUETA, type MotivoContacto } from "@/lib/crm/reglas";
import { claseBotonWhatsApp } from "../boton-whatsapp";

export type FilaContactoVista = {
  clientId: string;
  nombre: string;
  telefono: string;
  motivo: MotivoContacto;
  explicacion: string;
  /** Link wa.me con el texto ya armado (el servidor lo arma con `waLinkClienta`). */
  wa: string;
  /** "$ 84.000 por año", sólo si quien mira ve plata. */
  valor: string | null;
};

const TONO: Record<MotivoContacto, string> = {
  pasada: "bg-accent-soft text-accent-ink",
  resena: "bg-info-soft text-info",
  cumpleanios: "bg-success-soft text-success",
  recuperar: "bg-warning-soft text-warning",
};

export default function FilaContacto({ fila }: { fila: FilaContactoVista }) {
  const [contactadaEl, setContactadaEl] = useState<string | null>(null);
  const [error, setError] = useState("");

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/clientes/${fila.clientId}`} className="inline-flex min-h-11 items-center font-medium text-strong hover:underline">
            {fila.nombre}
          </Link>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONO[fila.motivo])}>{MOTIVO_ETIQUETA[fila.motivo]}</span>
        </p>
        <p className="text-muted">{fila.explicacion}</p>
        {fila.valor && <p className="text-xs text-muted">Gasta unos {fila.valor} (estimado).</p>}
        {contactadaEl && <p className="text-xs text-success">contactada {fmtTime(contactadaEl)}</p>}
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      <a
        href={fila.wa}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${contactadaEl ? "WhatsApp de nuevo" : "WhatsApp"} a ${fila.nombre}`}
        className={claseBotonWhatsApp(contactadaEl ? "outline" : "solid")}
        onClick={async () => {
          // La segunda vez sólo vuelve a abrir el chat: la constancia ya quedó y contarla dos
          // veces le comería un lugar al tope del día.
          if (contactadaEl) return;
          setError("");
          try {
            const r = await registrarContacto(fila.clientId, fila.motivo);
            if (r.ok) setContactadaEl(r.contactadaEl);
            else setError(r.error);
          } catch {
            setError("Se abrió WhatsApp pero no quedó anotado. Tocá de nuevo.");
          }
        }}
      >
        {contactadaEl ? "WhatsApp de nuevo" : "WhatsApp"}
      </a>
    </li>
  );
}
