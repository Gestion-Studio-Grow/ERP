"use client";

// DISEÑO NUEVO («Renglón»): «Quitar» ya no es un botón rojo en cada renglón de la lista de espera.
// Vive en el «⋯» y pide confirmar en un diálogo. Misma action que la pantalla de siempre.

import { useState } from "react";
import { cancelWaitlistEntry } from "@/lib/waitlist-actions";
import SubmitButton from "@/components/SubmitButton";
import { Button, Dialogo, MenuMas } from "@/components/ui";

export default function QuitarDeEspera({ id, nombre }: { id: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <MenuMas etiqueta={`Más sobre ${nombre}`}>
        <button type="button" data-peligro onClick={() => setAbierto(true)}>
          Quitar de la lista…
        </button>
      </MenuMas>
      {abierto && (
        <Dialogo
          abierto
          onCerrar={() => setAbierto(false)}
          titulo={`¿Quitar a ${nombre} de la lista de espera?`}
          descripcion="Deja de aparecer acá y en los huecos que se liberen. Si vuelve a pedir, hay que anotarla de nuevo."
        >
          <form action={cancelWaitlistEntry} className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="id" value={id} />
            <Button type="button" variant="outline" onClick={() => setAbierto(false)} className="min-h-11">
              No, dejarla
            </Button>
            <SubmitButton pendingText="Quitando…" variant="danger" className="min-h-11">
              Sí, quitarla
            </SubmitButton>
          </form>
        </Dialogo>
      )}
    </>
  );
}
