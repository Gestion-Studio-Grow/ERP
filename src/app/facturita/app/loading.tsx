// FACTOQUE · Mientras carga una pantalla de la app (/facturita/app/**). Las pantallas son
// force-dynamic (leen la base en cada pedido): sin esto, el clic no daba señal hasta que llegaba todo.
// Esqueleto quieto con la piel de Factoque (sin animación: respeta a quien pide menos movimiento) y un
// aviso para lectores de pantalla.

import type { CSSProperties } from "react";
import { PIEL_FACTURITA } from "../piel";

const BLOQUE: CSSProperties = { background: "var(--fx-papel-2)", borderRadius: "12px" };

export default function CargandoFactoque() {
  return (
    <div className="fx" style={{ minHeight: "auto", background: "transparent" }}>
      <style dangerouslySetInnerHTML={{ __html: PIEL_FACTURITA }} />
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="fx-caja fx-caja--alta"
        style={{ paddingBlock: "48px" }}
      >
        <span className="sr-only">Cargando la pantalla…</span>
        <div aria-hidden="true" style={{ display: "grid", gap: "16px" }}>
          <div style={{ ...BLOQUE, height: "32px", width: "45%" }} />
          <div style={{ ...BLOQUE, height: "18px", width: "80%" }} />
          <div style={{ ...BLOQUE, height: "140px", width: "100%", background: "var(--fx-papel)", border: "1px solid var(--fx-papel-2)" }} />
          <div style={{ ...BLOQUE, height: "56px", width: "220px", borderRadius: "14px" }} />
        </div>
      </div>
    </div>
  );
}
