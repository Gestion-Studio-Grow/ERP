"use server";

// «Cargar más» de la lista de Alumnos (B5: sin tope de 60, de a 40). Lectura: pide la app (el
// módulo y el rol, como la pantalla) y la consulta va acotada por el negocio (alumnosPagina).

import { requireAppAccion } from "@/lib/require-app";
import { alumnosPagina } from "@/lib/padel/datos.server";
import { aFila, type FilaAlumno } from "./_fila";

export async function masAlumnos(q: string, cursor: string): Promise<{ items: FilaAlumno[]; siguiente: string | null }> {
  await requireAppAccion("padel-clases");
  const texto = typeof q === "string" ? q.slice(0, 60) : "";
  const desde = typeof cursor === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(cursor) ? cursor : undefined;
  if (!desde) return { items: [], siguiente: null };
  const { items, siguiente } = await alumnosPagina(texto, desde);
  return { items: items.map(aFila), siguiente };
}
