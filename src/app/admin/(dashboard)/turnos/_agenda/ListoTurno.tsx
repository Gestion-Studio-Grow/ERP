"use client";

// ============================================================================
// «LISTO ✓» — después de dar el turno (reingeniería CH, Tanda 2, ch-DISENO.md §2.3).
// ============================================================================
//
// Una línea con el turno, otra con cómo quedó la plata («Confirmado · seña $5.000 por transferencia
// · falta $9.000») y UNA tecla grande: el WhatsApp con el texto armado (la confirmación, o el pedido
// de seña con monto y alias). Es un enlace de verdad a `wa.me` (se abre con el toque, sin que el
// navegador lo bloquee). Abajo, «Dar otro turno» y «Ver en la agenda». Todo lo que dice lo decide
// `listoDelTurno` (alta-core.ts, con test).

import { useEffect, useRef } from "react";
import { Button, atributosBoton, buttonClasses } from "@/components/ui";

export default function ListoTurno({
  resumen,
  estado,
  tecla,
  wa,
  onOtro,
  onVerAgenda,
}: {
  /** «Laura Gómez · sáb 24 · 16:00 · Caro · Piernas completas 30′». */
  resumen: string;
  /** «Confirmado · seña $5.000 por transferencia · falta $9.000». */
  estado: string;
  /** El texto de la tecla de WhatsApp. */
  tecla: string;
  /** El link `wa.me`, o `null` si el teléfono no es un celular. */
  wa: string | null;
  onOtro: () => void;
  onVerAgenda: () => void;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  // El foco va al título: el lector de pantalla anuncia que el turno quedó dado.
  useEffect(() => titulo.current?.focus(), []);
  return (
    <div className="space-y-5" data-ui="listo-turno" role="status">
      <div className="space-y-1">
        <h3 ref={titulo} tabIndex={-1} className="font-display text-lg font-medium text-strong outline-none">
          Listo ✓ Turno dado
        </h3>
        <p className="text-sm text-strong">{resumen}</p>
        <p className="text-sm text-muted">{estado}</p>
      </div>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClasses("solid", "lg", "w-full")} {...atributosBoton("solid", "lg")}>
          {tecla}
        </a>
      ) : (
        <p className="text-sm text-muted">El teléfono cargado no es un celular: no se puede abrir WhatsApp. Corregilo en su ficha.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onOtro}>
          Dar otro turno
        </Button>
        <Button type="button" variant="ghost" onClick={onVerAgenda}>
          Ver en la agenda
        </Button>
      </div>
    </div>
  );
}
