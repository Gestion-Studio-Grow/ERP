// Lo que el mostrador de CH necesita en la base LOCAL del recorrido (entorno-ch.mjs, nunca Neon): dos
// productos de reventa, como los que vende el local además de sus servicios, y —si se pide— «Diseño
// nuevo» prendido, para recorrer el cajón.
import { prismaComoDuenio } from "../../../test/base-efimera.ts";
import { ENTIDAD_INTERRUPTOR, ACCION_ENCENDER, CANAL_INTERRUPTOR, PREFIJO_ACTOR_OPERADOR } from "../../../cambios/interruptores.ts";

export const PRODUCTOS_DE_REVENTA = [
  { name: "Sérum vitamina C", price: 18000 },
  { name: "Crema hidratante facial", price: 12500 },
];

export async function prepararMostradorCH(e, { nuevo = false } = {}) {
  const db = await prismaComoDuenio(e.base);
  const tenantId = e.base.a.id;
  await db.product.createMany({ data: PRODUCTOS_DE_REVENTA.map((p) => ({ tenantId, ...p, stock: 20, trackStock: false })) });
  if (nuevo) {
    await db.auditLog.create({
      data: { tenantId, entity: ENTIDAD_INTERRUPTOR, entityId: "diseno-nuevo", action: ACCION_ENCENDER, channel: CANAL_INTERRUPTOR, actor: PREFIJO_ACTOR_OPERADOR + "e2e" },
    });
  }
  return db;
}
