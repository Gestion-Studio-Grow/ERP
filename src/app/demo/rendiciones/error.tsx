"use client";

// Límite de error de la demo de Rendí. Si algo revienta al dibujar (por ejemplo, un estado guardado
// de una versión vieja que el navegador trae de vuelta), en lugar de una pantalla en blanco se
// explica qué pasó y se ofrecen dos salidas: reintentar, o empezar de cero borrando lo guardado en
// este navegador.
//
// No importa el escenario, el motor ni el estado de la demo: tiene que andar aunque lo que falló
// sean ellos. Por eso la clave de guardado y el acento vienen de módulos hoja sin dependencias.

import { useEffect } from "react";
import { AvisoError, Button } from "@/components/ui";
import { useAdminTheme } from "@/app/admin/theme-client";
import { ACENTO_RENDI } from "./acento";
import { borrarGuardado } from "./almacen";

export default function ErrorDeLaDemo({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // El tema es la misma preferencia del resto del backoffice (claro/oscuro, sin parpadeo propio).
  const tema = useAdminTheme();

  // Queda en la consola del navegador para quien tenga que diagnosticarlo.
  useEffect(() => {
    console.error(error);
  }, [error]);

  const empezarDeCero = () => {
    borrarGuardado();
    reset();
  };

  return (
    <div
      data-skin="fable"
      data-theme={tema}
      style={ACENTO_RENDI}
      className="flex min-h-screen items-center justify-center bg-surface px-4 py-10 text-body"
    >
      <div className="w-full max-w-lg space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Rendí · demo</p>
        <AvisoError
          titulo="La demo tuvo un problema y no se pudo mostrar"
          comoSeguir="Probá de nuevo. Si vuelve a pasar, empezá de cero: se borra lo que hiciste en la demo, sólo en este navegador."
          accion={
            <>
              <Button size="sm" onClick={reset}>
                Reintentar
              </Button>
              <Button size="sm" variant="outline" onClick={empezarDeCero}>
                Empezar de cero
              </Button>
            </>
          }
        />
      </div>
    </div>
  );
}
