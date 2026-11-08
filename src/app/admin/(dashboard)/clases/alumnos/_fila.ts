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

/**
 * La fila sin plata, para quien no la ve (`veLaPlataDelDia`: el PROFESSIONAL). Se anula en el
 * servidor, antes de mandarla a la pantalla (certificación del arreglo UAT 11/2026).
 */
export const sinPlata = (f: FilaAlumno): FilaAlumno => ({ ...f, debe: 0, clasesQueDebe: 0, enRevision: 0, aFavor: 0 });
