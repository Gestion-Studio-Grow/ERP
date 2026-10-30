// Reglas puras de la vidriera del taller, compartidas por servidor (home) y cliente (turno). Sin base ni React.

/** Precio público de un trabajo, para ir detrás de «desde»: «$ 25.000». Sin precio no se llama: nunca un precio en cero. */
// Miles con punto a mano, sin Intl: el mismo texto en el servidor y en cualquier navegador (sin depender de que
// el navegador traiga los datos de es-AR; un Chrome headless devolvía «60,000» y no coincidía con el servidor).
export function desde(price: number): string {
  return `$ ${String(Math.round(price)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Misma regla en home y turno: sólo trabajos reales y con precio (los «de ejemplo» del alta no salen). */
export function esTrabajoPublicable(s: { name: string; price: number }): boolean {
  return s.price > 0 && !/de ejemplo/i.test(s.name);
}
