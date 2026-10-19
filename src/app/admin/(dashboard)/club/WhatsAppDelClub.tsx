"use client";

// ============================================================================
// EL BOTÓN DE WHATSAPP DEL CLUB — el texto listo, el link y, si abre sin número, por qué.
// ============================================================================
//
// Lo comparten el alta (confirmación), el turno (recordatorio), el plan lluvia y la lista de espera. Nada se manda
// solo: es un link que abre WhatsApp con el texto escrito y la persona aprieta enviar. Si no va directo al chat del
// cliente (demo, sin celular o con uno raro), la nota lo dice al lado del botón (whatsapp-core.ts).

import { useId, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import type { EnlaceWhatsApp } from "./whatsapp-core";

/** El texto que se va a mandar, tal cual (para leerlo antes de abrir WhatsApp). */
export function TextoWhatsApp({ texto, etiqueta = "Mensaje listo para mandar" }: { texto: string; etiqueta?: string }) {
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs font-medium text-muted">{etiqueta}</figcaption>
      <blockquote className="rounded-md border border-line bg-surface-raised p-3 text-sm whitespace-pre-line text-strong">{texto}</blockquote>
    </figure>
  );
}

export function BotonWhatsApp({
  enlace,
  children,
  variante = "outline",
  nombreAccesible,
  notaEn,
}: {
  enlace: EnlaceWhatsApp;
  children: ReactNode;
  variante?: "solid" | "outline";
  nombreAccesible?: string;
  /** Si varios botones comparten la nota, el id del texto que la muestra una sola vez (y éste no la repite). */
  notaEn?: string;
}) {
  const propia = useId();
  const nota = notaEn ?? propia;
  return (
    <span className="flex flex-col gap-1">
      <ButtonLink
        href={enlace.href}
        target="_blank"
        rel="noopener noreferrer"
        variant={variante}
        size="md"
        aria-label={nombreAccesible}
        aria-describedby={enlace.nota ? nota : undefined}
        className="max-sm:w-full"
      >
        {children}
      </ButtonLink>
      {enlace.nota && !notaEn && (
        <span id={nota} className="text-xs text-muted">
          {enlace.nota}
        </span>
      )}
    </span>
  );
}
