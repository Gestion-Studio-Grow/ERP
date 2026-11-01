import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { alumnoPublico, datosDelNegocio } from "@/lib/padel/datos.server";
import { getCurrentTenantId } from "@/lib/tenant";
import { VistaAlumno } from "../_vista/VistaAlumno";
import { RecordarSesion } from "../_vista/RecordarSesion";

// El link del alumno (el que le llega por WhatsApp): sin login, la llave es el token. Abrirlo deja
// este teléfono recordado (cookie httpOnly) y muestra la misma vista que /mis-clases. Un token que
// no existe en ESTE negocio → «Este link ya no funciona» (not-found.tsx), sin escribir cookie.
// No se indexa, no se cachea y no manda el link como Referer a los sitios que abre (wa.me, Maps).
export const dynamic = "force-dynamic";
const BASE: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  manifest: "/mis-clases/app.webmanifest",
  generator: "Gestión Studio Grow",
};

// Título y descripción con el nombre del profe (QA 29/10: no «Mis clases» suelto ni la descripción
// de la plataforma). Sale del negocio, nunca del alumno: el link se comparte por WhatsApp y la vista
// previa no tiene que decir de quién es.
export async function generateMetadata(): Promise<Metadata> {
  try {
    const n = await datosDelNegocio(await getCurrentTenantId());
    return { ...BASE, title: `Mis clases · ${n.nombre}`, description: `Tus clases de pádel con ${n.profe}: las próximas, lo que debés y cómo cambiar o cancelar.` };
  } catch {
    return { ...BASE, title: "Mis clases" };
  }
}

export default async function AlumnoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const datos = await alumnoPublico(token).catch(() => null);
  if (!datos) notFound();
  return (
    <>
      <RecordarSesion token={token} />
      <VistaAlumno datos={datos} token={token} />
    </>
  );
}
