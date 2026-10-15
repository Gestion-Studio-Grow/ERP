import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";

// RENDICIÓN DE GASTOS — la app está declarada `en-preparacion` (src/apps/catalogo/finanzas.ts):
// `requireApp` manda SIEMPRE a «App no disponible» (/admin/no-disponible?app=rendicion-de-gastos),
// que explica que la estamos terminando. Esta página existe para que la URL no dé 404 y para que
// la guardia sea la misma que tendrá la pantalla real.
//
// La pantalla todavía no existe: el motor vive en el repo de Rendí (C:\gsg-rendi) hasta que el
// dueño apruebe el plan de integración. Si alguien pasara la app a "lista" sin construirla, el
// `notFound()` de abajo da un 404 honesto en vez de una pantalla vacía.
export default async function RendicionesPage() {
  await requireApp("rendicion-de-gastos");
  notFound();
}
