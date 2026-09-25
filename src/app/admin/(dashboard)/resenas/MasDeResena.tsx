"use client";

// DISEÑO NUEVO («Renglón»): «Eliminar» ya no está a la vista en cada reseña. Vive en el «⋯» del
// renglón y pide confirmar en un diálogo, porque es lo único irreversible de la pantalla (la
// opinión de la clienta no vuelve). Misma action que la pantalla de siempre (deleteReview).

import { useState } from "react";
import { deleteReview } from "@/lib/reviews-actions";
import SubmitButton from "@/components/SubmitButton";
import { Button, Dialogo, MenuMas } from "@/components/ui";

export default function MasDeResena({ id, cliente }: { id: string; cliente: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <MenuMas etiqueta={`Más sobre la reseña de ${cliente}`}>
        <button type="button" data-peligro onClick={() => setAbierto(true)}>
          Eliminar la reseña…
        </button>
      </MenuMas>
      {abierto && (
        <Dialogo
          abierto
          onCerrar={() => setAbierto(false)}
          titulo={`¿Eliminar la reseña de ${cliente}?`}
          descripcion="No se puede deshacer: la opinión no vuelve. Si sólo no querés mostrarla en la web, ocultala."
        >
          <form action={deleteReview} className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="id" value={id} />
            <Button type="button" variant="outline" onClick={() => setAbierto(false)} className="min-h-11">
              No, dejarla
            </Button>
            <SubmitButton pendingText="Eliminando…" variant="danger" className="min-h-11">
              Sí, eliminarla
            </SubmitButton>
          </form>
        </Dialogo>
      )}
    </>
  );
}
