// EL LOGO DE CADA CLIENTE EN SU BACKOFFICE (con la estética de su front, src/lib/estetica-backoffice.ts). Cada uno sale
// de la marca que el cliente ya tiene, no se inventa:
//   · Break Point → su logo vectorial del club de hoy (public/previews/breakpoint/club/app.mjs, «logo-bp»).
//   · CH          → su nombre en la serif del sitio, en petróleo (src/app/(site)/_ch/Header.tsx).
//   · Magra       → MA·G·RA en Bebas con la G de oro, como su tienda (MagraFront.tsx «mf-logo», magra-content.ts).
//   · Matías      → no tiene logo todavía: una cancha de pádel vista de arriba con la pelota, en su verde. PROVISIONAL
//                   hasta que pase el suyo (docs/tenants/matiasconsoli/README.md, marca autorizada).
// Los colores van por tokens y por `data-logo` en globals.css; el nombre es texto real (el dibujo, aria-hidden).

import type { EsteticaBackoffice } from "@/lib/estetica-backoffice";

export default function LogoDelNegocio({ estetica, nombre }: { estetica: EsteticaBackoffice | null; nombre: string }) {
  switch (estetica) {
    case "breakpoint":
      return (
        <span data-logo="breakpoint" className="flex min-w-0 items-center gap-2.5">
          <span data-logo-parte="loseta" className="grid size-10 shrink-0 place-items-center rounded-[6px] p-1.5">
            <svg viewBox="0 0 104 80" aria-hidden="true" className="h-auto w-full">
              <rect x="0.5" y="3.5" width="3.6" height="73" fill="currentColor" />
              <g fill="currentColor" fontFamily="Montserrat,'Century Gothic','Avenir Next',sans-serif" fontWeight="500" fontSize="24.5">
                <text x="9.5" y="25" textLength="92" lengthAdjust="spacingAndGlyphs">BREAK</text>
                <text x="9.5" y="51" textLength="15.5" lengthAdjust="spacingAndGlyphs">P</text>
                <text x="45" y="51" textLength="56.5" lengthAdjust="spacingAndGlyphs">INT</text>
                <text x="9.5" y="77" textLength="92" lengthAdjust="spacingAndGlyphs">PADEL</text>
              </g>
              <g data-logo-parte="pelota" fill="none" strokeWidth="3.3" strokeLinecap="round">
                <circle cx="35" cy="42.4" r="8.1" />
                <path d="M34.2 35.6a7.6 7.6 0 0 0 0 13.6" />
              </g>
            </svg>
          </span>
          <span data-logo-parte="nombre" className="truncate">{nombre}</span>
        </span>
      );
    case "beauty-spa":
      return (
        <span data-logo="beauty-spa" className="truncate">
          {nombre}
        </span>
      );
    case "magra":
      return (
        <span data-logo="magra" className="truncate">
          <span className="sr-only">{nombre}</span>
          <span aria-hidden="true">
            MA<b>G</b>RA
          </span>
        </span>
      );
    case "matiasconsoli":
      return (
        <span data-logo="matiasconsoli" className="flex min-w-0 items-center gap-2.5">
          <svg viewBox="0 0 40 40" aria-hidden="true" data-logo-parte="loseta" className="size-10 shrink-0">
            <rect width="40" height="40" rx="11" fill="currentColor" />
            <g data-logo-parte="lineas" fill="none" strokeWidth="1.6" strokeLinecap="round">
              <rect x="6" y="11" width="28" height="18" rx="1.2" />
              <path d="M10.3 11v18M29.7 11v18M10.3 20h19.4" />
            </g>
            <path data-logo-parte="red" d="M20 9.5v21" strokeWidth="2.4" strokeLinecap="round" />
            <circle data-logo-parte="pelota" cx="31.5" cy="7.5" r="3.2" />
          </svg>
          <span className="flex min-w-0 flex-col leading-tight">
            <span data-logo-parte="nombre" className="truncate">{nombre}</span>
            <span data-logo-parte="bajada">Clases de pádel</span>
          </span>
        </span>
      );
    default:
      return null;
  }
}
