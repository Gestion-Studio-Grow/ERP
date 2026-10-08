"use client";

import { procesarArchivo } from "@/lib/marca-agua";
import { obtenerRepo } from "@/lib/repo";
import type { MarcaAgua } from "@/lib/tipos";

/**
 * Vuelve a generar vista previa y miniatura de cada medio con la marca indicada, a partir del original
 * (sólo el dueño puede leerlo). Secuencial para no saturar la memoria del navegador. Un error en un medio
 * no frena el resto.
 */
export async function rehacerMarcas(
  medioIds: string[],
  fotografoId: string,
  marca: MarcaAgua,
  alProgresar: (hechas: number, total: number, actual: string | null) => void,
): Promise<{ ok: number; errores: number }> {
  const repo = obtenerRepo();
  let ok = 0;
  let errores = 0;
  alProgresar(0, medioIds.length, null);
  for (let i = 0; i < medioIds.length; i++) {
    const id = medioIds[i];
    try {
      const original = await repo.originalParaDueno(id, fotografoId);
      const p = await procesarArchivo(original, marca);
      await repo.reemplazarVistas(id, p.previa, p.miniatura);
      ok++;
    } catch {
      errores++;
    }
    alProgresar(i + 1, medioIds.length, id);
  }
  return { ok, errores };
}
