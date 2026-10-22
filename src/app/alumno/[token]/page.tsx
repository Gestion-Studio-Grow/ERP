import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { alumnoPublico } from "@/lib/padel/datos.server";
import { VistaAlumno } from "../_vista/VistaAlumno";
import { RecordarSesion } from "../_vista/RecordarSesion";

// El link del alumno (el que le llega por WhatsApp): sin login, la llave es el token. Abrirlo deja
// este teléfono recordado (cookie httpOnly) y muestra la misma vista que /mis-clases. Un token que
// no existe en ESTE negocio → «Este link ya no funciona» (not-found.tsx), sin escribir cookie.
// No se indexa, no se cachea y no manda el link como Referer a los sitios que abre (wa.me, Maps).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mis clases",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  manifest: "/mis-clases/app.webmanifest",
  generator: "Gestión Studio Grow",
};

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
