// Lo que la página le pasa a Vender para las teclas del mostrador nuevo (Magra tanda 2 · 2A): las
// que fijó el dueño (AuditLog `TeclasFijadas`), si quien vende puede fijarlas, y la góndola
// explícita de cada producto (`Product.category`, columna de Gate 2: sin ella, la góndola sale del
// nombre en la pantalla). No es una Server Action: lo llama MostradorDeVenta, ya detrás de
// `requireApp("vender")`, con el negocio del request. Si algo no se puede leer, Vender sigue con las
// teclas de siempre.

import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { roleHasCapability, type Role } from "@/lib/capabilities";
import { cargarGondolas } from "@/lib/catalogo/precios-lectura";
import { leerTeclasFijadasDelNegocio } from "@/lib/vender/teclas-fijadas";

/** Las teclas del mostrador nuevo tal como las recibe VenderForm (`boutique.teclas`). */
export type TeclasDelMostrador = {
  /** Ids fijados por el dueño, en su orden (la pantalla descarta los que hoy no se venden). */
  fijadas: string[];
  /** La versión leída de la config (para guardar sin pisar a otro); null = nunca se guardó. */
  version: string | null;
  /** ¿Quien vende puede elegir las teclas fijas? (el dueño: `catalog:manage`). */
  puedeFijar: boolean;
  /** Góndola explícita por producto (sólo los que la tienen cargada). */
  gondolas: Record<string, string>;
};

export async function cargarTeclasDelMostrador(tenantId: string, role: Role): Promise<TeclasDelMostrador> {
  const [fijadas, gondolas] = await Promise.all([
    leerTeclasFijadasDelNegocio(prisma, tenantId).catch((e) => {
      logger.error("vender.teclas", "no se pudieron leer las teclas fijadas: Vender sigue con las de siempre", e);
      return { ids: [], version: null };
    }),
    // Sin la columna (antes de Gate 2) devuelve vacío o falla: la góndola sale del nombre.
    cargarGondolas(tenantId).catch(() => new Map<string, string>()),
  ]);
  return {
    fijadas: fijadas.ids,
    version: fijadas.version,
    puedeFijar: roleHasCapability(role, "catalog:manage"),
    gondolas: Object.fromEntries(gondolas),
  };
}
