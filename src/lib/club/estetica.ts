// La ESTÉTICA PROPIA de un club en el ERP (decisión del dueño, 19/10/2026): mismo motor e infraestructura, pero la
// pantalla conserva lo que se definió con el club — no el diseño general del ERP. Es opcional y se cobra; el club
// que no la tiene usa la del ERP. Break Point eligió «chapa» en el club de hoy (public/previews/breakpoint/club/
// index.html, `data-estilo="chapa"`): barra azul royal, doble línea naranja, Archivo angosta y esquinas rectas.
// Los tokens viven en globals.css bajo `[data-estetica-club]`; la letra, en ./estetica-fuente.ts.
//
// — Elaborado por GSG

export type EsteticaDelClub = "breakpoint";

const ESTETICA_POR_NEGOCIO: Readonly<Record<string, EsteticaDelClub>> = { breakpoint: "breakpoint" };

/** La estética propia del negocio, o `null` (la del ERP). PURA. */
export function esteticaDelClub(slug: string | null | undefined): EsteticaDelClub | null {
  return (slug && ESTETICA_POR_NEGOCIO[slug]) || null;
}
