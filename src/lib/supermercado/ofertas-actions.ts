"use server";

// ============================================================================
// ACCIONES DE OFERTAS DE LA SEMANA — alta, edición, pausa y baja de una promo automática.
// ============================================================================
//
// Guarda con control de versión (config-repo.ts): si otra persona cambió la promo mientras se
// editaba, se rechaza con qué hacer en vez de pisarle el cambio. Cada guardado es una fila de
// auditoría: quién, cuándo y cómo quedó la promo.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { Prisma } from "@/generated/prisma/client";
import { IDS_SECCION_SUPER } from "@/blueprints/retail/supermercado-tipos";
import { guardarPromocionEnTx, leerPromociones, type AccionPromocion, type PromocionGuardada } from "./config-repo";
import { problemaDeLaPromocion, productosDeLaPromocion, promocionDesdeAfuera, type Promocion } from "./promociones";

export type EstadoOfertas = { ok: true; mensaje: string; promociones: PromocionGuardada[] } | { ok: false; error: string };

const ACCIONES = new Set<AccionPromocion>(["crear", "editar", "pausar", "activar", "borrar"]);

const MENSAJE: Record<AccionPromocion, string> = {
  crear: "Promo creada: la caja ya la aplica.",
  editar: "Promo guardada.",
  pausar: "Promo pausada: la caja deja de aplicarla.",
  activar: "Promo activada: la caja la aplica desde ahora.",
  borrar: "Promo borrada.",
};

/** Guarda una promo. `entrada`: { accion, version, promocion }. */
export async function guardarPromocion(entrada: unknown): Promise<EstadoOfertas> {
  let user;
  try {
    user = await requireAppAccion("ofertas");
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
  const o = (entrada ?? {}) as Record<string, unknown>;
  const accion = o.accion as AccionPromocion;
  if (!ACCIONES.has(accion)) return { ok: false, error: "No se entendió qué hacer con la promo." };
  const versionLeida = typeof o.version === "string" && o.version ? o.version : null;
  const cruda = { ...((o.promocion ?? {}) as Record<string, unknown>) };
  // El id de una promo nueva lo pone el servidor.
  if (accion === "crear") cruda.id = `promo-${randomBytes(6).toString("hex")}`;
  const leida = promocionDesdeAfuera(cruda);
  if (!leida) return { ok: false, error: "La promo llegó incompleta: revisá los campos." };
  const tenantId = await getCurrentTenantId();

  let promocion: Promocion = leida;
  if (accion === "pausar" || accion === "activar" || accion === "borrar") {
    // Pausar, activar y borrar no editan: parten de la promo GUARDADA, no de lo que mandó la pantalla.
    const actual = (await leerPromociones(prisma, tenantId)).find((p) => p.id === leida.id);
    if (!actual) return { ok: false, error: "Esa promo ya no existe: volvé a abrir la lista." };
    const { version: _v, actualizada: _a, por: _p, ...sinMeta } = actual;
    void _v;
    void _a;
    void _p;
    promocion = { ...sinMeta, activa: accion === "activar" ? true : accion === "pausar" ? false : sinMeta.activa };
  } else {
    const problema = problemaDeLaPromocion(promocion);
    if (problema) return { ok: false, error: problema };
    if (!promocion.secciones.every((s) => (IDS_SECCION_SUPER as readonly string[]).includes(s))) {
      return { ok: false, error: "Hay una sección que no es del supermercado: elegila de la lista." };
    }
    // Los productos tienen que ser DE ESTE negocio (y estar vivos): el id lo manda el navegador.
    const ids = productosDeLaPromocion(promocion);
    if (ids.length > 0) {
      const propios = await prisma.product.count({ where: { tenantId, id: { in: ids }, deletedAt: null } });
      if (propios !== ids.length) return { ok: false, error: "Un producto de la promo no está en el catálogo: sacalo y volvé a elegirlo." };
    }
  }

  try {
    await tenantTransaction(
      (tx) => guardarPromocionEnTx(tx, tenantId, { promocion, accion, actor: `user:${user.id}`, versionLeida }),
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof RechazoDeDominio) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/admin/ofertas");
  revalidatePath("/admin/caja-rapida");
  revalidatePath("/tienda");
  return { ok: true, mensaje: MENSAJE[accion], promociones: await leerPromociones(prisma, tenantId) };
}
