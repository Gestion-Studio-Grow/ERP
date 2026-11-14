// La marca de GSG en React: el mismo dibujo que src/lib/gsg/marca-svg.ts (marca madre v10 «Doble G», en curvas).
// `IsotipoGSG` va en la firma «powered by GSG» del panel; `LogoGSG` en las pantallas que son de GSG y de nadie más
// (la dirección sin negocio). La forma en `currentColor`; el nudo y el ™ en cobre (`--gsg-cobre` sube en oscuro).
// Tamaños mínimos: el logo con nombre desde 56 px de alto (debajo, isotipo solo); el isotipo cambia de grilla
// debajo de 32 px (favicon 32) y de 24 px (favicon 16).
import { GSG_COBRE, ISOTIPO_GSG, LOGO_GSG_ALTO_MINIMO, LOGO_GSG_V10, geometriaIsotipoGsg } from "@/lib/gsg/marca-svg";

const COBRE = { fill: `var(--gsg-cobre, ${GSG_COBRE})` } as const;
const NOMBRE = "Gestión Studio Grow™";

export function IsotipoGSG({ className, tamano = 16, etiqueta }: { className?: string; tamano?: number; etiqueta?: string }) {
  const g = geometriaIsotipoGsg(tamano);
  return (
    <svg
      viewBox={g.viewBox}
      width={tamano}
      height={tamano}
      shapeRendering={g === ISOTIPO_GSG ? undefined : "crispEdges"}
      className={className}
      {...(etiqueta ? { role: "img", "aria-label": etiqueta } : { "aria-hidden": true, focusable: "false" })}
    >
      <path fill="currentColor" d={g.forma} />
      <path style={COBRE} d={g.nudo} />
    </svg>
  );
}

export function LogoGSG({ alto = LOGO_GSG_ALTO_MINIMO, className }: { alto?: number; className?: string }) {
  if (alto < LOGO_GSG_ALTO_MINIMO) return <IsotipoGSG tamano={alto} className={className} etiqueta={NOMBRE} />;
  const L = LOGO_GSG_V10;
  return (
    <svg viewBox={L.viewBox} width={Math.round((alto * L.ancho) / L.alto)} height={alto} role="img" aria-label={NOMBRE} className={className}>
      <g transform={L.isotipo}>
        <path fill="currentColor" d={ISOTIPO_GSG.forma} />
        <path style={COBRE} d={ISOTIPO_GSG.nudo} />
      </g>
      <path fill="currentColor" d={L.nombre} />
      <path style={COBRE} d={L.tm} />
    </svg>
  );
}
