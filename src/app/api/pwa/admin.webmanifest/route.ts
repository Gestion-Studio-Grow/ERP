import { NextResponse } from "next/server";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { brandForSlug, resolveAccent } from "@/lib/branding";
import { iconosPara, manifestDe } from "@/lib/terminal/manifest-core";

// MANIFIESTO DEL BACKOFFICE (/admin) POR NEGOCIO — "Instalá el panel en la tablet de recepción".
// Plan: docs/producto/PLAN-TERMINALES-MOSTRADOR.md §1.4 y fase T-5. Lo enlaza el layout de
// src/app/admin/(dashboard)/layout.tsx (`metadata.manifest`); Taller conserva el suyo en su página.
//
// POR QUÉ VIVE EN /api Y NO EN /admin: el navegador baja el manifiesto SIN cookies (Next sólo pone
// `crossorigin="use-credentials"` en previews de Vercel: node_modules/next/dist/lib/metadata/
// metadata.js:296). Bajo /admin el portón de sesión (src/proxy.ts) lo redirigiría a /admin/login y
// el navegador recibiría HTML en vez del manifiesto. /api queda fuera del portón de sesión y del
// portón del sitio (`SIEMPRE_ABIERTAS`, src/lib/site-gate.ts). Por eso mismo sólo expone nombre,
// color e ícono: nada que no vea cualquiera que tipee el host.
//
// POR HOST: el negocio sale del host del pedido (getCurrentTenantSlug → getCurrentTenantId,
// ADR-029). Si no se puede resolver (host desconocido, sin base), cae a la marca NEUTRA
// ("Mi negocio"), nunca a la de otro negocio (MT-1). `force-dynamic` + `Cache-Control: private`:
// el contenido depende del host y un CDN/proxy compartido no debe servírselo a otro negocio.
//
// SIN SERVICE WORKER, a propósito (explícitamente NO: serviceWorker, workbox, next-pwa,
// beforeinstallprompt propio). Un service worker cachea por ORIGEN, no por negocio ni por usuario:
// (1) en el mismo origen conviven el sandbox /demo y el negocio forzado de los previews; (2) en un
// equipo compartido, una página de /admin cacheada le mostraría el panel del cajero anterior a quien
// llega sin sesión; (3) uno desactualizado sirve un bundle viejo contra server actions nuevas. Y no
// compra nada: no hay venta sin conexión (plan §2.5). Chrome ofrece "Instalar" con manifiesto +
// HTTPS. Si algún día hiciera falta uno: sólo /_next/static/**, todo lo demás network-only, nunca
// navegaciones.
export const dynamic = "force-dynamic";

export async function GET() {
  // getCurrentTenantSlug ya es fail-open (null ante cualquier error) → marca neutra.
  const slug = await getCurrentTenantSlug().catch(() => null);
  const marca = brandForSlug(slug);
  const { accent } = resolveAccent(marca.preset, "light");
  return NextResponse.json(manifestDe(marca, accent, iconosPara(slug)), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      Vary: "Host",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
