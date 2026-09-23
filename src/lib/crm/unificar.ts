// ============================================================================
// UNIFICAR FICHAS — qué queda en la ficha que se conserva. PURO.
// ============================================================================
//
// La acción (crm-actions.ts) mueve turnos, pedidos y fiado a la ficha que queda, en una sola
// transacción, y borra las duplicadas. Acá se decide, sin base, lo que no es mover filas:
//   · que la operación tenga sentido (mismas clave de teléfono, ninguna repetida, la que queda
//     no está entre las que se borran);
//   · qué datos de las duplicadas se rescatan: sólo se COMPLETA lo que la ficha que queda no
//     tiene (email, cumpleaños, si es de la zona). Nunca se pisa un dato: el de la ficha elegida
//     es el que la recepción viene usando;
//   · las notas se suman, con de qué ficha vino cada una.
// Y lo que va a la auditoría, para poder deshacer a mano: la foto completa de cada ficha
// borrada y la lista de ids que se movieron.

import { mismaClave } from "./identidad";

export type FichaAUnificar = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  birthDate: Date | null;
  isResident: boolean | null;
  createdAt: Date;
};

export type CambiosFicha = {
  email?: string;
  notes?: string;
  birthDate?: Date;
  isResident?: boolean;
};

export type PlanUnificacion =
  | { ok: true; cambios: CambiosFicha }
  | { ok: false; error: string };

/** Los ids que llegan del formulario, limpios y sin repetir. */
export function idsUnicos(ids: readonly unknown[]): string[] {
  return [...new Set(ids.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

export function planUnificacion(conserva: FichaAUnificar | null, eliminadas: readonly FichaAUnificar[], pedidas: number): PlanUnificacion {
  if (!conserva) return { ok: false, error: "La ficha que elegiste conservar ya no existe. Recargá la pantalla." };
  if (pedidas === 0) return { ok: false, error: "Elegí al menos una ficha para sumar a la que queda." };
  if (eliminadas.length !== pedidas) {
    return { ok: false, error: "Alguna de esas fichas ya no existe (¿se unificó recién?). Recargá la pantalla." };
  }
  if (eliminadas.some((f) => f.id === conserva.id)) {
    return { ok: false, error: "La ficha que queda no puede estar también entre las que se suman." };
  }
  if (!mismaClave([conserva, ...eliminadas])) {
    return {
      ok: false,
      error: "Sólo se unifican fichas con el mismo teléfono. Si es otra persona, dejala como está.",
    };
  }

  const cambios: CambiosFicha = {};
  // Se recorren de la más vieja a la más nueva: si dos duplicadas tienen email, gana el primero
  // que se cargó, que es el que más tiempo estuvo en uso.
  const orden = [...eliminadas].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const f of orden) {
    if (!conserva.email && !cambios.email && f.email) cambios.email = f.email;
    if (!conserva.birthDate && !cambios.birthDate && f.birthDate) cambios.birthDate = f.birthDate;
    if (conserva.isResident === null && cambios.isResident === undefined && f.isResident !== null) cambios.isResident = f.isResident;
  }
  const notasSumadas = orden
    .filter((f) => f.notes?.trim())
    .map((f) => `De la ficha unificada de ${f.name} (${f.phone}): ${f.notes!.trim()}`);
  if (notasSumadas.length > 0) {
    cambios.notes = [conserva.notes?.trim(), ...notasSumadas].filter(Boolean).join("\n\n");
  }
  return { ok: true, cambios };
}

/** La foto de una ficha borrada, tal como va a la auditoría (fechas en ISO). */
export function fotoParaAuditoria(f: FichaAUnificar) {
  return {
    id: f.id,
    name: f.name,
    phone: f.phone,
    email: f.email,
    notes: f.notes,
    birthDate: f.birthDate ? f.birthDate.toISOString() : null,
    isResident: f.isResident,
    createdAt: f.createdAt.toISOString(),
  };
}
