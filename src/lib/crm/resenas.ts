// ============================================================================
// RESEÑAS — el promedio y cómo le va a cada profesional. PURO.
// ============================================================================
//
// La pantalla de Reseñas era una lista: para saber "cómo estamos" había que contar estrellas a
// mano. Acá se resume la MISMA lista que muestra la página (todas las reseñas del negocio, las
// publicadas y las ocultas), así el promedio de arriba y el del número del Inicio coinciden.

export type ResenaParaResumen = { rating: number; published: boolean; professionalId: string; profesional: string };

export type ResumenResenas = {
  total: number;
  /** Con un decimal, o null si no hay reseñas. */
  promedio: number | null;
  sinPublicar: number;
  porProfesional: { professionalId: string; profesional: string; cantidad: number; promedio: number }[];
};

const unDecimal = (n: number) => Math.round(n * 10) / 10;

export function resumirResenasDeLista(resenas: readonly ResenaParaResumen[]): ResumenResenas {
  const total = resenas.length;
  const suma = resenas.reduce((s, r) => s + r.rating, 0);
  const grupos = new Map<string, { profesional: string; cantidad: number; suma: number }>();
  for (const r of resenas) {
    const g = grupos.get(r.professionalId) ?? { profesional: r.profesional, cantidad: 0, suma: 0 };
    g.cantidad++;
    g.suma += r.rating;
    grupos.set(r.professionalId, g);
  }
  return {
    total,
    promedio: total > 0 ? unDecimal(suma / total) : null,
    sinPublicar: resenas.filter((r) => !r.published).length,
    // Más reseñas primero: un 5,0 con una sola reseña no dice lo mismo que un 4,7 con cuarenta.
    porProfesional: [...grupos]
      .map(([professionalId, g]) => ({ professionalId, profesional: g.profesional, cantidad: g.cantidad, promedio: unDecimal(g.suma / g.cantidad) }))
      .sort((a, b) => b.cantidad - a.cantidad || b.promedio - a.promedio || a.profesional.localeCompare(b.profesional, "es")),
  };
}
