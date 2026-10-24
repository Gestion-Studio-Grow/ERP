// Una fila de la lista de Alumnos, lista para viajar al cliente (sin token ni teléfono: la lista
// no los necesita; la ficha los lee del servidor). PURO.

export type FilaAlumno = {
  id: string;
  nombre: string;
  nivel: string;
  dadas: number;
  ultima: string | null;
  debe: number;
  clasesQueDebe: number;
  enRevision: number;
  aFavor: number;
};

export function aFila(a: {
  id: string;
  nombre: string;
  nivel?: string | null;
  dadas: number;
  ultima: Date | null;
  debe: number;
  clasesQueDebe: number;
  enRevision: number;
  aFavor: number;
}): FilaAlumno {
  return {
    id: a.id,
    nombre: a.nombre,
    nivel: a.nivel ?? "",
    dadas: a.dadas,
    ultima: a.ultima ? a.ultima.toISOString() : null,
    debe: a.debe,
    clasesQueDebe: a.clasesQueDebe,
    enRevision: a.enRevision,
    aFavor: a.aFavor,
  };
}

/** Los niveles que el profe toca como chips (texto libre en la base, `PadelAlumno.nivel`). */
export const NIVELES = ["Inicial", "Intermedio", "Avanzado"] as const;
