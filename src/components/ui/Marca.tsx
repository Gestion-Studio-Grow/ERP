import { cn } from "./cn";

// ============================================================================
// MARCA DE ESTADO — forma + palabra. Reemplaza a las insignias de color.
// ============================================================================
//
// ● hecho (cobrado, listo, entregado) · ○ pendiente · ◐ a medias · ✕ anulado · ⚠ pide acción.
// La forma y la palabra dicen el estado; el color sólo refuerza (nunca el color solo, WCAG 1.4.1).
// Condensada, 13 px: entra en la columna del folio de una tabla densa.

export type TipoMarca = "hecho" | "pendiente" | "medias" | "anulado" | "atencion" | "info";

// Las formas se dibujan (SVG de 10×10 en `currentColor`), no se escriben: «◐» y «⚠» no están en
// Archivo y cada teléfono los tomaba de otra letra (en Chromium de Linux salía un medio círculo
// aplastado). Dibujadas, son las mismas en todos lados y en los dos modos.
const FORMA: Record<TipoMarca, React.ReactNode> = {
  hecho: <circle cx="5" cy="5" r="4" fill="currentColor" />,
  pendiente: <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.3" />,
  medias: (
    <>
      <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 1.6a3.4 3.4 0 0 1 0 6.8z" fill="currentColor" />
    </>
  ),
  anulado: <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  atencion: (
    <>
      <path d="M5 1.2l4.2 7.6H.8z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M5 4v2.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="5" cy="7.6" r=".6" fill="currentColor" />
    </>
  ),
  info: <circle cx="5" cy="5" r="4" fill="currentColor" />,
};

function Forma({ tipo }: { tipo: TipoMarca }) {
  return (
    <svg data-parte="forma" viewBox="0 0 10 10" width="10" height="10" aria-hidden focusable="false">
      {FORMA[tipo]}
    </svg>
  );
}

export function Marca({ tipo, children, className }: { tipo: TipoMarca; children: React.ReactNode; className?: string }) {
  return (
    <span data-ui="marca" data-tipo={tipo} className={cn("inline-flex items-baseline gap-1 text-[13px] font-semibold", className)}>
      <Forma tipo={tipo} />
      {children}
    </span>
  );
}

/**
 * El riel de estados de un pedido o un turno: los pasos hechos llenos y los que faltan vacíos
 * (`●●○○○`), con la palabra del paso actual al lado (la pone el llamador con `Marca`). El
 * nombre de cada paso va para el lector de pantalla.
 */
export function RielDeEstados({ pasos, hechos }: { pasos: readonly string[]; hechos: number }) {
  const texto = `${Math.min(hechos, pasos.length)} de ${pasos.length}: ${pasos.slice(0, hechos).join(", ") || "ninguno"}`;
  return (
    <span data-ui="riel" role="img" aria-label={texto}>
      {pasos.map((p, i) => (
        <svg key={p} data-parte="paso" data-hecho={i < hechos ? "" : undefined} viewBox="0 0 10 10" width="7" height="7" aria-hidden focusable="false">
          {i < hechos ? FORMA.hecho : FORMA.pendiente}
        </svg>
      ))}
    </span>
  );
}
