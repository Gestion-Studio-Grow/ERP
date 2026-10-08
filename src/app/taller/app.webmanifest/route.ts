import { NextResponse } from "next/server";
import { getCurrentTenantId } from "@/lib/tenant";
import { datosDelNegocio } from "@/lib/taller/datos.server";
import { marcaTaller } from "@/lib/taller/marca";

// Manifiesto de la app instalable del taller ("Agregar a la pantalla de inicio"): abre directo
// en el tablero del día, a pantalla completa, con el ícono y el nombre del negocio.
export const dynamic = "force-dynamic";

export async function GET() {
  let nombre = "Taller";
  let slug = "";
  try {
    const n = await datosDelNegocio(await getCurrentTenantId());
    nombre = n.nombre;
    slug = n.slug;
  } catch {}
  const m = marcaTaller(slug);
  return NextResponse.json(
    {
      name: nombre,
      short_name: nombre.replace(/taller mec[aá]nico\s*/i, "Taller ").slice(0, 12),
      description: "El taller en el celular: autos, presupuestos, cobros y avisos.",
      start_url: "/admin/taller",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      lang: "es-AR",
      background_color: m.tinta,
      theme_color: m.tinta,
      icons: [{ src: m.logo ?? "/favicon.ico", sizes: "any", type: m.logo ? "image/svg+xml" : "image/x-icon", purpose: "any" }],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
