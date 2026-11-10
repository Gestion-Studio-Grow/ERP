// FACTOQUE · El logo en la barra de la vidriera: versión «barra» de la marca F06-A (isotipo + «Factoque™»), en curvas
// desde la fuente única (src/lib/factoque-icono.ts). Tinta grafito fija (la vidriera va en claro), nudo y ™ en cobre.
// Mínimo de la marca: 44 px de alto.
import { FACTOQUE_COBRE, FACTOQUE_TINTA, ISOTIPO_FACTOQUE, LOGO_FACTOQUE } from "@/lib/factoque-icono";

export default function LogoFactoque({ alto = 56 }: { alto?: number }) {
  const L = LOGO_FACTOQUE;
  const alt = Math.max(44, alto);
  return (
    <svg viewBox={L.barra.viewBox} width={Math.round((alt * L.barra.ancho) / L.barra.alto)} height={alt} role="img" aria-label="Factoque™">
      <g transform={L.isotipo}>
        <path fill={FACTOQUE_TINTA} d={ISOTIPO_FACTOQUE.forma} />
        <path fill={FACTOQUE_COBRE} d={ISOTIPO_FACTOQUE.nudo} />
      </g>
      <path fill={FACTOQUE_TINTA} d={L.nombre} />
      <path fill={FACTOQUE_COBRE} d={L.tm} />
    </svg>
  );
}
