"use client";

// «Facturar» de una venta (Ventas del día y la última venta de Vender). El estado de la
// factura queda A LA VISTA en la fila: facturada con su número, en trámite, rechazada, o «Sin
// factura» con el porqué —la facturación apagada, un dato fiscal que falta— y el botón para
// reintentar. Nunca un botón que no dice qué pasó.
//
// La acción se INVOCA DIRECTO (no `useActionState`), como en el libro de caja: por ese camino
// una respuesta que ya llegó podía quedar colgada en "Facturando…" (caja/libro/LibroForms.tsx).

import { useState, useTransition } from "react";
import { facturarVenta, type EstadoFacturaVenta } from "@/lib/order-actions";
import { buttonClasses, cn } from "@/components/ui";
import type { FacturaDeVenta } from "./factura";

const TONO: Record<FacturaDeVenta["estado"], string> = {
  facturada: "text-success",
  "en-tramite": "text-info",
  rechazada: "text-danger",
  "sin-factura": "text-muted",
};

// El redirect de sesión vencida llega como excepción con digest NEXT_REDIRECT: se deja pasar.
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function FacturarVenta({
  orderId,
  inicial,
  className,
}: {
  orderId: string;
  /** Lo que la fila sabe de la factura al dibujarse (leído de la base). */
  inicial: FacturaDeVenta;
  className?: string;
}) {
  const [estado, setEstado] = useState<EstadoFacturaVenta>(null);
  const [enviando, startTransition] = useTransition();
  const factura = estado?.factura ?? inicial;
  // Se ofrece facturar mientras no haya comprobante; si el intento falló, el mismo botón reintenta.
  const ofrecer = factura.estado === "sin-factura";
  const intentoFallido = estado !== null && !estado.ok;

  function facturar() {
    const fd = new FormData();
    fd.set("id", orderId);
    startTransition(async () => {
      try {
        setEstado(await facturarVenta(null, fd));
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        const motivo = "No se pudo facturar ahora. Revisá la conexión y reintentá: si ya se había emitido, no se emite dos veces.";
        setEstado({ ok: false, error: motivo, factura: { estado: "sin-factura", texto: `Sin factura: ${motivo}` } });
      }
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span role="status" className={cn("text-xs", TONO[factura.estado])}>
        {factura.texto}
      </span>
      {ofrecer && (
        <button type="button" onClick={facturar} disabled={enviando} className={buttonClasses("outline", "md")}>
          {enviando ? "Facturando…" : intentoFallido ? "Reintentar" : "Facturar"}
        </button>
      )}
    </div>
  );
}
