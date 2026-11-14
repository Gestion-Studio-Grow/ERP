// Los textos del paso «¡Listo!» de la Bienvenida (T4 ProfeTurnos). PURO: sin red ni navegador.
//   - textoParaBio: lo que el profe pega en la bio de Instagram (tope de Instagram: 150 letras).
//   - linkCompartirWhatsApp: abre WhatsApp con el mensaje armado para que elija a quién mandarlo.

/** Tope de la bio de Instagram. */
export const TOPE_BIO = 150;

/** «A», «A y B», «A, B y C». */
export function enumerar(nombres: readonly string[]): string {
  const n = nombres.map((x) => x.trim()).filter(Boolean);
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

/**
 * Texto sugerido para la bio. Si con los clubes se pasa del tope, va sin ellos; si igual se pasa
 * (un link larguísimo), va sólo el link.
 */
export function textoParaBio(d: { link: string; clubes?: readonly string[] }): string {
  const cierre = `Pedí tu clase acá: ${d.link}`;
  const donde = enumerar(d.clubes ?? []);
  const completo = donde ? `Clases de pádel en ${donde}. ${cierre}` : `Clases de pádel. ${cierre}`;
  if (completo.length <= TOPE_BIO) return completo;
  const corto = `Clases de pádel. ${cierre}`;
  return corto.length <= TOPE_BIO ? corto : d.link;
}

/** Mensaje para mandar a los alumnos por WhatsApp. */
export function mensajeParaAlumnos(link: string): string {
  return `¡Hola! Ya podés pedirme clase de pádel desde acá, eligiendo el día y la hora: ${link}`;
}

/** `wa.me/?text=` sin número: WhatsApp le pregunta al profe a quién mandarlo. */
export function linkCompartirWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
