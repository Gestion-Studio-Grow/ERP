"use client";

// LA BARRA FIJA DE ABAJO (ronda 2, P0-3): la del celular con el resumen de la bolsa o «Reservar». Una sola regla para
// los fronts: se ve debajo de 1024 px, mide 64 px + la zona segura del teléfono, y queda `inert` (ni foco ni toque)
// mientras hay una hoja (`<dialog>`) abierta, para no tapar ni robar el foco de la hoja. Antes había ≥ 11 barras con 4
// cortes distintos. La marca pone fondo, borde y contenido (hijos); la conducta es ésta.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

export const CORTE_BARRA_FIJA = 1024;

/** CSS de la barra (una vez por página). Los fronts que la adoptan sólo ponen color con `--barra-*`. */
export const CSS_BARRA_FIJA = `.gsg-barra{position:fixed;inset:auto 0 0 0;z-index:40;min-height:calc(64px + env(safe-area-inset-bottom));padding:8px clamp(16px,4vw,24px) calc(8px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:12px;background:var(--barra-fondo,#fff);color:var(--barra-tinta,inherit);border-top:1px solid var(--barra-linea,rgba(0,0,0,.12));box-shadow:0 -8px 24px rgba(0,0,0,.12)}
@media (min-width:${CORTE_BARRA_FIJA}px){.gsg-barra{display:none}}
.gsg-barra-hueco{height:calc(80px + env(safe-area-inset-bottom))}
@media (min-width:${CORTE_BARRA_FIJA}px){.gsg-barra-hueco{display:none}}`;

/** ¿Hay un `<dialog>` modal abierto en la página? Se mira en vivo (las hojas de cada front se abren solas). */
function useHayHojaAbierta(): boolean {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    const mirar = () => setHay(document.querySelector("dialog[open]") != null);
    const obs = new MutationObserver(mirar);
    obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"], childList: true });
    mirar();
    return () => obs.disconnect();
  }, []);
  return hay;
}

export default function BarraFija({ children, etiqueta, className, style }: { children: ReactNode; etiqueta: string; className?: string; style?: CSSProperties }) {
  const tapada = useHayHojaAbierta();
  return (
    <>
      <div className="gsg-barra-hueco" aria-hidden />
      <div role="region" aria-label={etiqueta} className={className ? `gsg-barra ${className}` : "gsg-barra"} style={style} inert={tapada || undefined}>
        {children}
      </div>
    </>
  );
}
