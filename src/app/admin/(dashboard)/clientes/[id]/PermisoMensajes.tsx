"use client";

// "No quiere mensajes" en la ficha. Es la baja que pide la Ley 25.326 (art. 27): desde que se
// marca, la bandeja no la propone, la acción de contacto la rechaza y la difusión no la cuenta.
// Se guarda como constancia en la auditoría (exenta de la purga), con quién y cuándo.
//
// No lleva confirmación: se deshace con el mismo botón y no borra nada.

import { useState, useTransition } from "react";
import { cambiarPermisoMensajes } from "@/lib/crm-actions";
import { buttonClasses } from "@/components/ui";

export default function PermisoMensajes({
  clientId,
  noQuiere,
  detalle,
  puedeCambiar,
}: {
  clientId: string;
  noQuiere: boolean;
  /** "desde el 12/09/2026, lo cargó Ana", si hay constancia. */
  detalle: string | null;
  puedeCambiar: boolean;
}) {
  const [error, setError] = useState("");
  const [pendiente, start] = useTransition();

  function cambiar(quiere: "si" | "no") {
    setError("");
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("quiere", quiere);
    start(async () => {
      try {
        const r = await cambiarPermisoMensajes(fd);
        if (!r.ok) setError(r.error);
      } catch {
        setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className={noQuiere ? "font-medium text-danger" : "font-medium text-strong"}>
          {noQuiere ? "No quiere recibir mensajes" : "Recibe mensajes"}
        </p>
        <p className="text-muted">
          {noQuiere
            ? `No se le escribe desde la bandeja ni entra en la difusión${detalle ? ` (${detalle})` : ""}.`
            : detalle
              ? `Volvió a aceptar mensajes (${detalle}).`
              : "Nunca pidió la baja. Si te pide que no le escriban más, marcalo acá."}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-danger">
            {error}
          </p>
        )}
      </div>
      {puedeCambiar && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => cambiar(noQuiere ? "si" : "no")}
          className={buttonClasses("outline", "md", "shrink-0")}
        >
          {pendiente ? "Guardando…" : noQuiere ? "Vuelve a aceptar mensajes" : "No quiere mensajes"}
        </button>
      )}
    </div>
  );
}
