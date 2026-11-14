"use client";

// FACTOQUE · Error de una pantalla de la app (/facturita/app/**). Sin este archivo, una pantalla que
// fallaba (p. ej. requireTenantFacturita, src/lib/facturita-actions.ts) subía hasta global-error y la
// persona se quedaba sin la barra de arriba y sin salida (PLAT-005). Acá la barra sigue (este límite
// vive adentro del layout de la app) y hay dos salidas: «Probar de nuevo» y «Volver al panel».
//
// Piel de Factoque (piel.ts + estilos.ts), en criollo claro. El detalle del error no se muestra
// (puede filtrar datos internos): va a la consola; el `digest` cruza el reporte con el log.
// `retry` (Next 16) vuelve a pedir la página al servidor; `reset` sólo limpia el estado.
// No atrapa errores del propio layout de la app (marca, contexto del producto): ésos van a
// global-error, que también tiene salida. Es <section> y no <main>: el <main> lo pone el layout.
// Accesibilidad: role="alert", foco al título al aparecer, botones de 56 px (≥ 44).

import { useEffect, useRef } from "react";
import { PIEL_FACTURITA } from "../piel";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO } from "../estilos";

const PANEL = "/facturita/app";

export default function ErrorDeFactoque({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    console.error(error);
  }, [error]);
  useEffect(() => {
    titulo.current?.focus();
  }, []);

  return (
    <div className="fx" style={{ minHeight: "auto", background: "transparent" }}>
      <style dangerouslySetInnerHTML={{ __html: PIEL_FACTURITA }} />
      <section className="fx-caja fx-caja--alta" style={{ paddingBlock: "48px" }}>
        <div role="alert">
          <p className="fx-ante">Algo no anduvo</p>
          <h1 ref={titulo} tabIndex={-1} className="fx-h3" style={{ outline: "none" }}>
            No pudimos abrir esta pantalla
          </h1>
          <p className="fx-bajada">
            Puede ser un corte momentáneo. Probá de nuevo; si sigue igual, volvé al panel y entrá otra vez en unos
            minutos. Tus facturas ya emitidas no se tocaron.
          </p>
        </div>
        <div className="fx-acciones">
          <button type="button" className={BOTON_PRINCIPAL} onClick={() => (retry ?? reset)()}>
            Probar de nuevo
          </button>
          {/* <a> común y no <Link>: una carga completa sale limpia del estado de error. */}
          <a href={PANEL} className={BOTON_SECUNDARIO}>
            Volver al panel
          </a>
        </div>
        {error.digest ? (
          <p className="fx-chico" style={{ marginTop: "28px" }}>
            Código para soporte: <code>{error.digest}</code>
          </p>
        ) : null}
      </section>
    </div>
  );
}
