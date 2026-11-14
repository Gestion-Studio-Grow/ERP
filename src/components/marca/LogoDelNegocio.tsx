// EL LOGO DE CADA CLIENTE EN SU BACKOFFICE (con la estética de su front, src/lib/estetica-backoffice.ts). Cada uno sale
// de la marca que el cliente ya tiene, no se inventa:
//   · Break Point → su logo vectorial del club de hoy (public/previews/breakpoint/club/app.mjs, «logo-bp»).
//   · CH          → su nombre en la serif del sitio, en petróleo (src/app/(site)/_ch/Header.tsx).
//   · Magra       → MA·G·RA en Bebas con la G de oro, como su tienda (MagraFront.tsx «mf-logo», magra-content.ts).
//   · Matías      → no tiene logo todavía: una cancha de pádel vista de arriba con la pelota, en su verde. PROVISIONAL
//                   hasta que pase el suyo (docs/tenants/matiasconsoli/README.md, marca autorizada).
//   · MIA         → su logo del sitio, negro en el tema claro y crema en el oscuro (src/lib/proyectos/marca.ts).
//   · Shine, Taller AGR, Qué Bien Olés → su logo real, el mismo archivo que usa su front (LOGO_REAL, abajo).
//   · El resto → LOGO TIPOGRÁFICO (co-marca, 29/10/2026): la loseta con sus iniciales en el acento del negocio y su
//     nombre, marcado «Logo provisional · a confirmar» hasta que el cliente pase el suyo. Nunca el de otro negocio.
//   · Demo GSG (src/lib/marca-demo.ts) → el mismo tipográfico con «GSG» en cobre, el nombre de la demo y «Demo · …».
//     Sin isotipo ni piezas de la marca GSG (guarda sin-gsg-en-tenants.test.ts): GSG firma abajo, con FirmaGSG.
// Los colores van por tokens y por `data-logo` en globals.css; el nombre es texto real (el dibujo, aria-hidden).

import type { EsteticaBackoffice } from "@/lib/estetica-backoffice";
import { MARCA_DEMO_GSG, presentaComoDemoGsg } from "@/lib/marca-demo";

// La leyenda de la demo: avisa que es una demo y de qué rubro, en minúscula después del punto medio.
const LEYENDA_DEMO = `Demo · ${MARCA_DEMO_GSG.bajada.charAt(0).toLowerCase()}${MARCA_DEMO_GSG.bajada.slice(1)}`;

// Logos reales que ya están en public/tenants (los mismos del front de cada negocio). Por slug exacto: un local con otro slug
// cae al logo tipográfico hasta que se lo agregue acá. PDC no figura: la inmobiliaria no se toca (orden del dueño, 29/10). Medidas = las del archivo, para
// reservar el lugar (CLS 0); se muestran a 40 px de alto como máximo.
const LOGO_REAL: Readonly<Record<string, { src: string; ancho: number; alto: number; conNombre?: boolean }>> = {
  shinevelas: { src: "/tenants/shinevelas/brand/logo.webp", ancho: 480, alto: 148 },
  "taller-agr": { src: "/tenants/taller-agr/marca/logo.webp", ancho: 498, alto: 247 },
  agr: { src: "/tenants/taller-agr/marca/logo.webp", ancho: 498, alto: 247 },
  // Su marca es la placa con la Q didona; el nombre va al lado, en texto.
  quebienoles: { src: "/tenants/quebienoles/marca/favicon.svg", ancho: 64, alto: 64, conNombre: true },
};

/** El logo real de este negocio, si hay uno cargado. PURA. */
export function logoRealDe(slug: string | null | undefined) {
  if (!slug) return null;
  return LOGO_REAL[slug] ?? null;
}

export default function LogoDelNegocio({
  estetica,
  nombre,
  slug = null,
  monograma = "",
}: {
  estetica: EsteticaBackoffice | null;
  nombre: string;
  slug?: string | null;
  monograma?: string;
}) {
  // DEMO GSG (src/lib/marca-demo.ts): el logo tipográfico con la sigla en cobre y el nombre de la demo, y la leyenda
  // «Demo · …» donde el provisional dice «Logo provisional». Nunca el logo del cliente; tampoco el isotipo de GSG (C12:
  // el logo de un negocio es sólo suyo; GSG firma abajo con FirmaGSG, sin excepción para la demo).
  if (presentaComoDemoGsg(slug)) {
    return (
      <LogoTipografico
        nombre={nombre}
        monograma={MARCA_DEMO_GSG.monograma}
        leyenda={LEYENDA_DEMO}
        logo="demo-gsg"
      />
    );
  }
  const real = estetica ? null : logoRealDe(slug);
  if (real) {
    return (
      <span data-logo="real" className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- archivo chico ya optimizado (webp/svg), sin next/image */}
        <img
          src={real.src}
          width={real.ancho}
          height={real.alto}
          alt={real.conNombre ? "" : nombre}
          decoding="async"
          className={real.conNombre ? "size-10 shrink-0 rounded-[10px]" : "h-10 w-auto max-w-[200px] object-contain object-left"}
        />
        {real.conNombre && <span data-logo-parte="nombre" className="truncate">{nombre}</span>}
      </span>
    );
  }
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
          {/* Como el club de hoy: al lado del logo, «Gestión del club» en dos renglones espaciados (el nombre ya
              está en el logo; para el lector va entero). */}
          <span data-logo-parte="nombre" className="sr-only">{nombre}</span>
          <span data-logo-parte="bajada" aria-hidden="true" className="flex flex-col leading-tight">
            <span>Gestión</span>
            <span>del club</span>
          </span>
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
            <span data-logo-parte="provisional" className="mt-0.5 whitespace-nowrap text-[11px] font-medium tracking-[.03em] text-faint">
              Logo provisional · a confirmar
            </span>
          </span>
        </span>
      );
    case "mia-producciones":
      return (
        <span data-logo="mia-producciones" className="flex min-w-0 items-center">
          <span className="sr-only">{nombre}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-logo-parte="claro" src="/tenants/mia-producciones/marca/logo-negro.svg" alt="" className="h-7 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-logo-parte="oscuro" src="/tenants/mia-producciones/marca/logo-crema.svg" alt="" className="h-7 w-auto" />
        </span>
      );
    default:
      return <LogoTipografico nombre={nombre} monograma={monograma} />;
  }
}

/**
 * LOGO TIPOGRÁFICO PROVISIONAL: el negocio todavía no pasó su logo. Loseta con las iniciales en el acento del negocio
 * (par AA accent/on-accent del preset) + el nombre entero, y la aclaración «Logo provisional · a confirmar» (sólo en
 * la barra y el cajón; en la cabecera del celular va la loseta sola). `data-logo="provisional"` lo deja medible.
 * La demo GSG usa la misma pieza con su leyenda («Demo · …», que se corta con «…» si no entra) y `data-logo="demo-gsg"`.
 */
export function LogoTipografico({
  nombre,
  monograma,
  leyenda,
  logo = "provisional",
}: {
  nombre: string;
  monograma: string;
  leyenda?: string;
  logo?: "provisional" | "demo-gsg";
}) {
  const iniciales = (monograma || "").trim() || nombre.trim().slice(0, 1).toUpperCase() || "•";
  const esDemo = logo === "demo-gsg";
  return (
    <span data-logo={logo} className="flex min-w-0 items-center gap-3" title={leyenda ?? "Logo provisional, a confirmar con GSG"}>
      <span
        aria-hidden="true"
        data-logo-parte="loseta"
        className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-accent text-[15px] font-bold tracking-[-0.02em] text-on-accent shadow-xs"
      >
        {iniciales.slice(0, 3)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span data-logo-parte="nombre" className="line-clamp-2 text-[17px] font-[650] leading-[1.15] tracking-[-0.02em] text-strong [text-wrap:balance]">
          {nombre}
        </span>
        {esDemo ? (
          <span data-logo-parte="leyenda" className="mt-0.5 truncate text-[11px] font-medium tracking-[.03em] text-muted">
            {leyenda}
          </span>
        ) : (
          <span data-logo-parte="provisional" className="mt-0.5 whitespace-nowrap text-[11px] font-medium tracking-[.03em] text-faint">
            Logo provisional · a confirmar
          </span>
        )}
      </span>
    </span>
  );
}
