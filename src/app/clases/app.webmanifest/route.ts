import { NextResponse } from "next/server";
import { getCurrentTenantId } from "@/lib/tenant";
import { datosDelNegocio } from "@/lib/padel/datos.server";
import { marcaProfe } from "@/lib/padel/marca";

// Manifiesto de la app instalable del profe ("Agregar a la pantalla de inicio"): abre directo
// en "Hoy", a pantalla completa, con el nombre del negocio. Entre clase y clase, un toque.
export const dynamic = "force-dynamic";

export async function GET() {
  let nombre = "Clases";
  let slug = "";
  try {
    const n = await datosDelNegocio(await getCurrentTenantId());
    nombre = n.nombre;
    slug = n.slug;
  } catch {}
  const m = marcaProfe(slug);
  return NextResponse.json(
    {
      name: nombre,
      short_name: nombre.split(/[\s—-]+/).slice(0, 2).join(" ").slice(0, 12),
      description: "Tus clases en el celular: pedidos, cobros y la próxima clase.",
      start_url: "/admin/clases",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      lang: "es-AR",
      background_color: m.tinta,
      theme_color: m.tinta,
      icons: [{ src: m.logo ?? "/favicon.ico", sizes: "any", type: m.logo ? "image/webp" : "image/x-icon", purpose: "any" }],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
