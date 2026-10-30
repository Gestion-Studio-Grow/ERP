// Reglas puras de la vidriera del taller, compartidas por servidor (home) y cliente (turno). Sin base ni React.

/** Precio público de un trabajo, para ir detrás de «desde»: «$ 25.000». Sin precio no se llama: nunca un precio en cero. */
export function desde(price: number): string {
  return `$ ${Math.round(price).toLocaleString("es-AR")}`;
}

/** Misma regla en home y turno: sólo trabajos reales y con precio (los «de ejemplo» del alta no salen). */
export function esTrabajoPublicable(s: { name: string; price: number }): boolean {
  return s.price > 0 && !/de ejemplo/i.test(s.name);
}
