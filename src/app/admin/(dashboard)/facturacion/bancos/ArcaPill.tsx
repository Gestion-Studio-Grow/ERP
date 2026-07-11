// Píldora de estado ARCA — punto de color + texto, estilo "st-pill" del mockup
// GSG Fable claro, traducida a los tokens del design system. Presentacional
// pura (sin "use client"): la renderiza el server component de la página con
// el estado fiscal que ya expone facturacion-actions (misma fuente que la
// pantalla de Facturación — consistencia, no un semáforo paralelo).

import type { EstadoFiscal } from "@/lib/facturacion-actions";

const MODO_UI = {
  real: { texto: "ARCA · CAE en línea", dot: "bg-success", pulsa: true },
  homologacion: { texto: "ARCA · homologación (pruebas oficiales)", dot: "bg-warning", pulsa: false },
  stub: { texto: "ARCA · modo prueba (sin red)", dot: "bg-warning", pulsa: false },
} as const;

export default function ArcaPill({ estado }: { estado: EstadoFiscal }) {
  const ui = MODO_UI[estado.modo] ?? MODO_UI.stub;
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface-raised px-3 py-1 text-xs font-medium text-muted shadow-xs"
      title={
        estado.cuit
          ? `CUIT ${estado.cuit} · punto de venta ${estado.puntoVenta ?? "—"}`
          : "Sin CUIT cargado todavía"
      }
    >
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${ui.dot}`}
        // Reusa el keyframe ch-pulse de globals.css (con guard de prefers-reduced-motion).
        style={ui.pulsa ? { animation: "ch-pulse 2.6s infinite" } : undefined}
      />
      {ui.texto}
    </span>
  );
}
