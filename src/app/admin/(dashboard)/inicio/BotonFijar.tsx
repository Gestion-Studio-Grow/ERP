"use client";

// El alfiler de cada botón del Inicio: fija la app en "Mis apps" o la saca. Va AL LADO del
// link del tile, no adentro (un botón dentro de un link no se puede usar con teclado ni con
// lector de pantalla). Mide 44 × 44 y dice qué hace con su nombre: "Fijar Vender en Mis apps".
//
// La respuesta llega como aviso: quien fija una app de abajo de todo no ve aparecer "Mis apps"
// arriba, y tiene que enterarse de que quedó. Si se corta la conexión, el aviso lo dice y el
// Inicio sigue como estaba (nunca la pantalla de error).

import { useFormStatus } from "react-dom";
import { useToast } from "../ToastProvider";
import { cambiarFijada } from "./fijadas-actions";

function Alfiler({ fijada, nombre }: { fijada: boolean; nombre: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-pressed={fijada}
      aria-label={fijada ? `Quitar ${nombre} de Mis apps` : `Fijar ${nombre} en Mis apps`}
      title={fijada ? "Quitar de Mis apps" : "Fijar en Mis apps"}
      disabled={pending}
      aria-busy={pending || undefined}
      className={`grid size-11 place-items-center rounded-lg transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60 ${
        fijada ? "text-accent" : "text-faint hover:text-strong"
      }`}
    >
      <svg
        className="h-[18px] w-[18px]"
        viewBox="0 0 24 24"
        fill={fijada ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" />
        <path d="M12 14v6" fill="none" />
      </svg>
    </button>
  );
}

export default function BotonFijar({
  appId,
  nombre,
  fijada,
  className,
}: {
  appId: string;
  nombre: string;
  fijada: boolean;
  className?: string;
}) {
  const { showError, showSuccess } = useToast();
  return (
    <form
      className={className}
      action={async (datos) => {
        try {
          const r = await cambiarFijada(datos);
          if (r.ok) showSuccess(r.mensaje);
          else showError(r.mensaje);
        } catch {
          showError("No se pudo guardar el cambio. Revisá la conexión y probá de nuevo.");
        }
      }}
    >
      <input type="hidden" name="app" value={appId} />
      <input type="hidden" name="accion" value={fijada ? "quitar" : "fijar"} />
      <Alfiler fijada={fijada} nombre={nombre} />
    </form>
  );
}
