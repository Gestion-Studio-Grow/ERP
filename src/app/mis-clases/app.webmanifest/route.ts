import { NextResponse } from "next/server";
import { getCurrentTenantId } from "@/lib/tenant";
import { datosDelNegocio } from "@/lib/padel/datos.server";
import { marcaProfe } from "@/lib/padel/marca";
import { manifiestoAlumno } from "./manifiesto";

// Manifiesto de la app instalable del ALUMNO (M-049): abre en /mis-clases, nunca en /admin.
// El enlace desde las páginas públicas lo cambia la Tanda 3C (hoy enlazan el del profe).
export const dynamic = "force-dynamic";

export async function GET() {
  let negocio = { profe: "", nombre: "" };
  let slug = "";
  try {
    const n = await datosDelNegocio(await getCurrentTenantId());
    negocio = { profe: n.profe, nombre: n.nombre };
    slug = n.slug;
  } catch {}
  return NextResponse.json(manifiestoAlumno(negocio, marcaProfe(slug)), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
