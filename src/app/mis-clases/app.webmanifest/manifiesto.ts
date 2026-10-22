// El manifiesto de la app del ALUMNO (§2.2): «Clases con Matías» en la pantalla de inicio, que
// abre en /mis-clases (la cookie del alumno lo lleva a su vista). Es otro que el del profe
// (/clases/app.webmanifest, start_url /admin/clases): el alumno nunca instala una app que
// arranca en el backoffice. Puro: la ruta le pasa el negocio y la marca.

import type { MarcaProfe } from "@/lib/padel/marca";

export function manifiestoAlumno(negocio: { profe: string; nombre: string }, m: Pick<MarcaProfe, "logo" | "tinta">) {
  const profe = negocio.profe && negocio.profe !== "profe" ? negocio.profe : "";
  const name = profe ? `Clases con ${profe}` : negocio.nombre || "Mis clases";
  return {
    id: "/mis-clases",
    name,
    short_name: (profe ? `Clases ${profe}` : "Mis clases").slice(0, 12),
    description: "Tus clases de pádel: la próxima, repetir la de la semana que viene y mandar el comprobante.",
    start_url: "/mis-clases",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es-AR",
    background_color: m.tinta,
    theme_color: m.tinta,
    icons: [{ src: m.logo ?? "/favicon.ico", sizes: "any", type: m.logo ? "image/webp" : "image/x-icon", purpose: "any" }],
  };
}
