// LA ESTÉTICA DEL BACKOFFICE DE CADA CLIENTE (decisión del dueño, 19/10/2026): el panel de cada negocio se ve con la
// estética de SU front y SU marca, no con el diseño general del ERP. Mismo motor, misma infraestructura; la piel es
// del cliente. El layout del admin pone `data-estetica` en la raíz y globals.css traduce los valores del front a los
// tokens del ERP (superficies, texto, líneas, acento, letra, radios), así todas las pantallas los toman sin tocar
// componentes. Un negocio sin entrada usa la del ERP (skin Fable).
//
// De dónde sale cada una (los valores, en globals.css, citan su fuente):
//   · breakpoint  → el estilo «chapa» que el club eligió en el club de hoy (public/previews/breakpoint/club/index.html).
//
// — Elaborado por GSG

export type EsteticaBackoffice = "breakpoint";

const ESTETICA_POR_NEGOCIO: Readonly<Record<string, EsteticaBackoffice>> = { breakpoint: "breakpoint" };

/** La estética del backoffice de este negocio, o `null` (la del ERP). PURA. */
export function esteticaBackoffice(slug: string | null | undefined): EsteticaBackoffice | null {
  return (slug && ESTETICA_POR_NEGOCIO[slug]) || null;
}
