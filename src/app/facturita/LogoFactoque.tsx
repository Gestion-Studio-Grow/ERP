// FACTOQUE · El logo de la vidriera, en curvas desde la fuente única (src/lib/factoque-icono.ts). Tinta grafito fija (la
// vidriera va en claro), nudo y ™ en cobre. Dos versiones (logo-madre-final.md §8):
// - «barra» (isotipo + «Factoque™»): la cabecera, mínimo 44 px de alto;
// - `respaldo` (+ «Powered by Gestión Studio Grow», F06-A): sólo desde 88 px de alto, para que el respaldo no baje de 11 px.
import {
  FACTOQUE_COBRE,
  FACTOQUE_GRIS,
  FACTOQUE_TINTA,
  ISOTIPO_FACTOQUE,
  LOGO_FACTOQUE,
} from "@/lib/factoque-icono";

/** Alto mínimo de cada versión (px). */
export const ALTO_MINIMO_BARRA = 44;
export const ALTO_MINIMO_RESPALDO = 88;

export default function LogoFactoque({
  alto = 56,
  respaldo = false,
  className,
}: {
  alto?: number;
  /** Con «Powered by Gestión Studio Grow». Debajo de 88 px se dibuja sin respaldo (regla de la marca). */
  respaldo?: boolean;
  className?: string;
}) {
  const L = LOGO_FACTOQUE;
  const conRespaldo = respaldo && alto >= ALTO_MINIMO_RESPALDO;
  const caja = conRespaldo ? L.horizontal : L.barra;
  const alt = Math.max(ALTO_MINIMO_BARRA, alto);
  return (
    <svg
      viewBox={caja.viewBox}
      width={Math.round((alt * caja.ancho) / caja.alto)}
      height={alt}
      role="img"
      aria-label={conRespaldo ? "Factoque™, powered by Gestión Studio Grow" : "Factoque™"}
      className={className}
    >
      <g transform={L.isotipo}>
        <path fill={FACTOQUE_TINTA} d={ISOTIPO_FACTOQUE.forma} />
        <path fill={FACTOQUE_COBRE} d={ISOTIPO_FACTOQUE.nudo} />
      </g>
      <path fill={FACTOQUE_TINTA} d={L.nombre} />
      <path fill={FACTOQUE_COBRE} d={L.tm} />
      {conRespaldo && <path fill={FACTOQUE_GRIS} d={L.respaldo} />}
    </svg>
  );
}
