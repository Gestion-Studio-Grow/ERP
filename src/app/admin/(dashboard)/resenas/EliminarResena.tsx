"use client";

// "Eliminar" una reseña con confirmación. Borrarla no se deshace (la opinión de la clienta no
// vuelve), y el botón vivía pegado a "Publicar": un toque de más en el celular la perdía. Es de lo
// poco irreversible de esta pantalla, así que pide un segundo toque; publicar y ocultar, no.

import { useState } from "react";
import { deleteReview } from "@/lib/reviews-actions";
import SubmitButton from "@/components/SubmitButton";

// El chip-btn fija 40 px con CSS sin capa (globals.css); en el celular se sube a 44 px con `!`.
const CHIP = "chip-btn w-full sm:w-auto text-xs min-h-8 max-sm:min-h-11!";

export default function EliminarResena({ id, cliente }: { id: string; cliente: string }) {
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className={`${CHIP} chip-btn-danger`}>
        Eliminar
      </button>
    );
  }
  return (
    <form
      action={deleteReview}
      role="group"
      aria-label={`Confirmar que se elimina la reseña de ${cliente}`}
      className="flex flex-col items-stretch gap-1.5 whitespace-normal sm:items-end"
    >
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-strong sm:text-right">¿Eliminarla? No se puede deshacer.</p>
      <div className="flex gap-2">
        <SubmitButton pendingText="Eliminando…" className={`${CHIP} chip-btn-danger`}>
          Sí, eliminar
        </SubmitButton>
        <button type="button" onClick={() => setConfirmando(false)} className={CHIP}>
          No
        </button>
      </div>
    </form>
  );
}
