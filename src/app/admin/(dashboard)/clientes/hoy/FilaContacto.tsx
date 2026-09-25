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
import { Marca, Renglon, buttonClasses, type TipoMarca } from "@/components/ui";
import { fmtTime } from "@/lib/datetime";
import { MOTIVO_ETIQUETA, type MotivoContacto } from "@/lib/crm/reglas";

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
  pasada: "text-accent-ink",
  resena: "text-info",
  cumpleanios: "text-success",
  recuperar: "text-warning",
};
// La forma de la marca (§1.4: forma + palabra; el color sólo refuerza).
const FORMA: Record<MotivoContacto, TipoMarca> = {
  pasada: "pendiente",
  resena: "info",
  cumpleanios: "hecho",
  recuperar: "atencion",
};

export default function FilaContacto({ fila, renglon = false }: { fila: FilaContactoVista; /** «Diseño nuevo»: el mismo contacto como Renglón. */ renglon?: boolean }) {
  const [contactadaEl, setContactadaEl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const tecla = (
      <a
        href={fila.wa}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${contactadaEl ? "WhatsApp de nuevo" : "WhatsApp"} a ${fila.nombre}`}
        className={buttonClasses(contactadaEl ? "ghost" : "outline", "sm", "whitespace-nowrap ")}
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
  );
  if (renglon) {
    return (
      <Renglon
        as="li"
        titulo={
          <Link href={`/admin/clientes/${fila.clientId}`} className="hover:underline">
            {fila.nombre}
          </Link>
        }
        detalle={
          <>
            <Marca tipo={FORMA[fila.motivo]} className={TONO[fila.motivo]}>
              {MOTIVO_ETIQUETA[fila.motivo]}
            </Marca>
            {" · "}
            {fila.explicacion}
            {fila.valor && ` · gasta unos ${fila.valor} (estimado)`}
            {contactadaEl && <span className="text-success"> · contactada {fmtTime(contactadaEl)}</span>}
            {error && (
              <span className="block text-danger" role="alert">
                {error}
              </span>
            )}
          </>
        }
        tecla={tecla}
      />
    );
  }
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/clientes/${fila.clientId}`} className="inline-flex min-h-11 items-center font-medium text-strong hover:underline">
            {fila.nombre}
          </Link>
          <Marca tipo={FORMA[fila.motivo]} className={TONO[fila.motivo]}>
            {MOTIVO_ETIQUETA[fila.motivo]}
          </Marca>
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
        className={buttonClasses(contactadaEl ? "ghost" : "outline", "md", "whitespace-nowrap max-sm:w-full")}
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
