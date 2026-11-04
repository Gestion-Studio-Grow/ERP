"use client";

// ============================================================================
// «LISTO ✓» DESPUÉS DE COBRAR EN EL CAJÓN (Venta y agenda simples, T2).
// ============================================================================
//
// Lo cobrado («$27.000 en efectivo · vuelto $3.000»), [Mandar comprobante por WhatsApp] (link `wa.me`
// que abre la recepción, con monto, medio y fecha; sin celular no aparece) y [¿Le damos el próximo?]
// (el mismo `/admin/turnos/proximo/[id]` de agenda práctica, sólo si está). «Listo» cierra el cajón.

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button, atributosBoton, buttonClasses } from "@/components/ui";
import { listoDelCobro, type CobroHecho } from "@/lib/turnos/cobro-del-cajon";

export default function ListoDelCobro({ cobro, proximo, onCerrar }: { cobro: CobroHecho; proximo?: string | null; onCerrar: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  const { linea, wa } = listoDelCobro(cobro);
  return (
    <div data-ui="listo-del-cobro" role="status" className="space-y-4">
      <div className="space-y-1">
        <h3 ref={titulo} tabIndex={-1} className="font-display text-lg font-medium text-strong outline-none">
          Listo ✓ Cobrado
        </h3>
        <p className="text-sm text-strong">{cobro.clienta}</p>
        <p className="text-sm text-muted">{linea}</p>
      </div>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClasses("solid", "lg", "w-full")} {...atributosBoton("solid", "lg")}>
          Mandar comprobante por WhatsApp
        </a>
      )}
      {proximo && (
        <Link href={proximo} className={buttonClasses("outline", "lg", "w-full")} {...atributosBoton("outline", "lg")}>
          ¿Le damos el próximo?
        </Link>
      )}
      <Button type="button" variant="ghost" className="w-full" onClick={onCerrar}>
        Listo
      </Button>
    </div>
  );
}
