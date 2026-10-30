// Reglas puras de la agenda viva (ProximoHueco): qué hora ofrecer y si la que se tocó sigue libre.
/** El primer hueco libre en esos días, en orden. PURA. */
export function primerHueco(map: Record<string, string[]>, fechas: string[]): { day: string; slot: string } | null {
  for (const day of fechas) {
    const slot = map[day]?.[0];
    if (slot) return { day, slot };
  }
  return null;
}

/** ¿Esa hora sigue libre en la lectura nueva? PURA. */
export function sigueLibre(map: Record<string, string[]>, day: string, slot: string): boolean {
  return (map[day] ?? []).includes(slot);
}
