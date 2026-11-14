"use client";

// ============================================================================
// ERROR DE UNA PANTALLA DEL PANEL — el armazón se queda.
// ============================================================================
//
// Si una pantalla falla al cargar, falla SÓLO esa pantalla: la cabecera, los espacios y el buscador
// siguen (este límite de error vive adentro del layout del panel). Dice en una frase qué pasó,
// ofrece «Probar de nuevo» y, sólo cuando es cierto, que un cobro sin confirmar quedó guardado
// (Vender lo guarda en la pestaña: cobro-sin-conexion.ts).
//
// Diseño nuevo: la tarjeta con la piel nueva (`data-ui`). Apagado (CH hoy): antes se relanzaba el
// error y lo atendía global-error.tsx, que reemplaza TODO (sin menú ni salida). Ahora el de siempre
// también muestra su tarjeta, con las clases de siempre y un enlace al inicio del panel (PLAT-005).
//
// `retry` (Next 16) vuelve a pedir la pantalla al servidor; `reset` sólo limpia el estado y, si el
// error vino del servidor, repetía el mismo error. Foco al título al aparecer (lectores de pantalla).

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { buttonClasses } from "@/components/ui";

type Props = { error: Error & { digest?: string }; reset: () => void; retry?: () => void };

export default function ErrorDeLaPantalla({ error, reset, retry }: Props) {
  const nuevo = useDiseno();
  const ruta = usePathname() ?? "";
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    console.error(error);
  }, [error]);
  useEffect(() => {
    titulo.current?.focus();
  }, []);
  const otraVez = () => (retry ?? reset)();
  const enVender = ruta.startsWith("/admin/vender");
  const avisoVender =
    "Si un cobro quedó sin confirmar, Vender lo tiene guardado en esta pestaña y lo muestra al volver: no lo cargues de nuevo sin mirarlo.";

  if (!nuevo) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div role="alert" className="rounded-xl border border-line bg-surface p-6">
          <h1 ref={titulo} tabIndex={-1} className="text-xl font-semibold text-strong outline-none">
            No se pudo mostrar esta pantalla
          </h1>
          <p className="mt-2 text-sm text-muted">
            Algo falló al cargarla. El resto del panel sigue andando: probá de nuevo o volvé al inicio.
          </p>
          {enVender && <p className="mt-2 text-sm text-muted">{avisoVender}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={otraVez} className={buttonClasses("solid", "md", "min-h-11")}>
              Probar de nuevo
            </button>
            <Link href="/admin" className={buttonClasses("outline", "md", "min-h-11")}>
              Volver al inicio
            </Link>
          </div>
          {error.digest && <p className="mt-4 text-[13px] text-muted">Código para soporte: {error.digest}</p>}
        </div>
      </div>
    );
  }

  return (
    <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
      <div role="alert" className="max-w-2xl border-y border-line py-4">
        <h1 ref={titulo} tabIndex={-1} className="text-xl font-bold text-strong outline-none">
          No se pudo mostrar esta pantalla
        </h1>
        <p className="mt-2 text-sm text-muted">
          Algo falló al cargarla. El resto del panel sigue andando: probá de nuevo, o seguí desde otra app de arriba.
        </p>
        {enVender && <p className="mt-2 text-sm text-muted">{avisoVender}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={otraVez} data-ui="button" data-variant="solid" data-size="md" className="inline-flex min-h-11 items-center rounded px-4 font-semibold">
            Probar de nuevo
          </button>
          {error.digest && <span className="text-[13px] text-muted">Código para soporte: {error.digest}</span>}
        </div>
      </div>
    </main>
  );
}
