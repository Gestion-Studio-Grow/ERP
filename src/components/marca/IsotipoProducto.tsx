// El isotipo del producto (Comerciante, Contador, Factoque) en React: la forma en `currentColor` y el nudo en el
// cobre de la casa (`--gsg-cobre` sube en oscuro). Sin producto (ERP vertical) no dibuja nada: ahí va la marca del
// negocio. El dibujo vive en src/lib/gsg/isotipos-productos.ts (provisional a confirmar, MARCA-005).
import { GSG_COBRE } from "@/lib/gsg/marca-svg";
import { isotipoDeProducto } from "@/lib/gsg/isotipos-productos";
import type { ProductoConMarca } from "@/lib/producto-identidad";

const COBRE = { fill: `var(--gsg-cobre, ${GSG_COBRE})` } as const;

export function IsotipoProducto({
  producto,
  tamano = 48,
  className,
}: {
  producto: ProductoConMarca | null | undefined;
  tamano?: number;
  className?: string;
}) {
  const g = isotipoDeProducto(producto);
  if (!g) return null;
  return (
    <svg viewBox={g.viewBox} width={tamano} height={tamano} className={className} aria-hidden focusable="false">
      <path fill="currentColor" d={g.forma} />
      <path style={COBRE} d={g.nudo} />
    </svg>
  );
}
