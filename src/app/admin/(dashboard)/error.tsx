"use client";

// ============================================================================
// ERROR DE UNA PANTALLA DEL PANEL — el armazón se queda.
// ============================================================================
//
// Con el diseño nuevo, si una pantalla falla al cargar, falla SÓLO esa pantalla: la cabecera, los
// espacios y el buscador siguen (este límite de error vive adentro del layout del panel). Dice en
// una frase qué pasó, ofrece «Probar de nuevo» y, sólo cuando es cierto, que un cobro sin confirmar
// quedó guardado (Vender lo guarda en la pestaña: cobro-sin-conexion.ts).
//
// Apagado (CH hoy): se relanza el error y lo atiende el de siempre (global-error.tsx), como antes
// de que existiera este archivo.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useDiseno } from "@/lib/diseno/DisenoProvider";

export default function ErrorDeLaPantalla({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const nuevo = useDiseno();
  const ruta = usePathname() ?? "";
  useEffect(() => {
    if (nuevo) console.error(error);
  }, [nuevo, error]);
  if (!nuevo) throw error;
  const enVender = ruta.startsWith("/admin/vender");
  return (
    <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
      <div role="alert" className="max-w-2xl border-y border-line py-4">
        <h1 className="text-xl font-bold text-strong">No se pudo mostrar esta pantalla</h1>
        <p className="mt-2 text-sm text-muted">
          Algo falló al cargarla. El resto del panel sigue andando: probá de nuevo, o seguí desde otra app de arriba.
        </p>
        {enVender && (
          <p className="mt-2 text-sm text-muted">
            Si un cobro quedó sin confirmar, Vender lo tiene guardado en esta pestaña y lo muestra al volver: no lo cargues de nuevo sin mirarlo.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={reset} data-ui="button" data-variant="solid" data-size="md" className="inline-flex min-h-11 items-center rounded px-4 font-semibold">
            Probar de nuevo
          </button>
          {error.digest && <span className="text-[13px] text-muted">Código para soporte: {error.digest}</span>}
        </div>
      </div>
    </main>
  );
}
