import "server-only";
// Lectura de la ficha técnica de color (paquete Peluquerías, T4).
// Tolera la migración 20261110120000_ficha_color sin aplicar (Gate 2): devuelve «pendiente».
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { getBrandSheet } from "@/lib/brand-sheet";
import { esMigracionPendiente, rubroConFichaDeColor } from "./ficha-color-core";

export type FichaColorFila = {
  id: string;
  fecha: Date;
  tono: string;
  formula: string;
  oxidante: number | null;
  tiempoPose: number | null;
  profesional: string | null;
  notas: string | null;
};

export type EstadoFichaColor =
  | { estado: "apagado" }
  | { estado: "pendiente" }
  | { estado: "ok"; fichas: FichaColorFila[] };

export async function fichasDeColorDeLaClienta(clientId: string): Promise<EstadoFichaColor> {
  const marca = await getBrandSheet();
  if (!rubroConFichaDeColor(marca.blueprintId)) return { estado: "apagado" };
  const tenantId = await getCurrentTenantId();
  try {
    const fichas = await tenantTransaction(
      (tx) =>
        tx.fichaColor.findMany({
          where: { tenantId, clientId },
          orderBy: { fecha: "desc" },
          take: 20,
          select: { id: true, fecha: true, tono: true, formula: true, oxidante: true, tiempoPose: true, profesional: true, notas: true },
        }),
      { tenantId },
    );
    return { estado: "ok", fichas };
  } catch (e) {
    if (esMigracionPendiente(e)) return { estado: "pendiente" };
    throw e;
  }
}
