// ============================================================================
// NUEVA FICHA — el cuerpo de la transacción de `crearFicha` (client-actions.ts).
// ============================================================================
//
// Vive fuera del "use server" para que un test lo ejecute: ahí cada export es un endpoint, y
// esta función recibe el negocio por parámetro.
//
// LO QUE PASABA:
//   · el duplicado se buscaba FUERA de la transacción: dos altas simultáneas con el mismo
//     número (dos pestañas, un doble clic que el botón no frenó) veían "no existe" las dos y
//     creaban dos fichas de la misma persona;
//   · para buscarlo se leían TODAS las fichas del negocio, y para atar los pedidos, TODOS los
//     pedidos sin ficha, sin tope.
//
// AHORA, adentro de UNA transacción:
//   1. un candado por (negocio, teléfono normalizado) — `pg_advisory_xact_lock`, se suelta solo
//      al terminar la transacción —: la segunda alta del mismo número espera a la primera y
//      después ve su ficha. Altas de números distintos no se esperan entre sí;
//   2. se leen sólo las fichas y los pedidos sin ficha cuyo teléfono TERMINA con los mismos
//      últimos 6 dígitos de la clave (SQL), y la coincidencia exacta la decide
//      `normalizarTelefono` en memoria, la misma regla de siempre.
//
// POR QUÉ 6 DÍGITOS: la clave (`normalizarTelefono`) sólo saca prefijos (00, 54, 0, 9) y, en un
// número de 12 dígitos, un "15" que empieza a más tardar en el dígito 5. Así que los últimos 6
// dígitos de la clave son SIEMPRE los últimos 6 dígitos de lo tipeado: el filtro en SQL no deja
// afuera ninguna escritura del mismo número. Deja pasar otros números que terminan igual, y
// esos los saca el filtro exacto. Sin columna normalizada no hay índice que usar (el arreglo de
// fondo es `Client.phoneKey`, con migración): la base recorre las filas del negocio, pero a la
// aplicación llegan sólo las candidatas.
//
// El candado cubre ESTA alta contra ella misma. Los caminos que crean fichas al dar un turno
// (actions.ts, lista de espera) no lo toman: una reserva y un alta a mano del mismo número en
// el mismo segundo todavía pueden dar dos fichas (queda anotado en la entrega).

import type { Prisma } from "@/generated/prisma/client";
import { normalizarTelefono } from "./telefono";

/** Cuántos dígitos del final se comparan en SQL. Ver la cabecera: no puede ser más de 6. */
export const DIGITOS_DEL_FILTRO = 6;

/** La clave del candado del alta: por negocio y por número (normalizado). PURA. */
export function claveDelCandadoDeFicha(tenantId: string, clave: string): string {
  return `ficha:${tenantId}:${clave}`;
}

/** El patrón LIKE de los teléfonos candidatos (sólo dígitos: no trae comodines). PURA. */
export function patronDeCandidatos(clave: string): string {
  return `%${clave.slice(-DIGITOS_DEL_FILTRO)}`;
}

export type DatosDeFichaNueva = {
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  birthDate: Date | null;
};

export type FichaCreada =
  | { ok: true; id: string; pedidos: string[] }
  | { ok: false; existente: { id: string; name: string; phone: string } };

/**
 * Crea la ficha y le ata los pedidos sin ficha con su número, o devuelve la ficha que ya tiene
 * ese número. DENTRO de la transacción del llamador (`tenantTransaction`).
 */
export async function crearFichaEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  d: DatosDeFichaNueva,
): Promise<FichaCreada> {
  const clave = normalizarTelefono(d.phone);

  if (clave) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claveDelCandadoDeFicha(tenantId, clave)}))`;
    const patron = patronDeCandidatos(clave);
    // El `tenantId` a mano, además de RLS: una consulta cruda no pasa por el candado de la app.
    const candidatas = await tx.$queryRaw<{ id: string; name: string; phone: string }[]>`
      SELECT "id", "name", "phone" FROM "Client"
      WHERE "tenantId" = ${tenantId}
        AND regexp_replace("phone", '[^0-9]', '', 'g') LIKE ${patron}
      ORDER BY "createdAt" ASC, "id" ASC`;
    const yaExiste = candidatas.find((f) => normalizarTelefono(f.phone) === clave);
    if (yaExiste) return { ok: false, existente: yaExiste };
  }

  // Los pedidos sin ficha con este MISMO número (escrito como sea): pasan a su historial.
  const pedidos = clave
    ? (
        await tx.$queryRaw<{ id: string; customerPhone: string }[]>`
          SELECT "id", "customerPhone" FROM "Order"
          WHERE "tenantId" = ${tenantId}
            AND "clientId" IS NULL
            AND regexp_replace("customerPhone", '[^0-9]', '', 'g') LIKE ${patronDeCandidatos(clave)}`
      )
        .filter((o) => normalizarTelefono(o.customerPhone) === clave)
        .map((o) => o.id)
    : [];

  const creada = await tx.client.create({
    data: { tenantId, name: d.name, phone: d.phone, email: d.email, notes: d.notes, birthDate: d.birthDate },
    select: { id: true },
  });
  // `clientId: null` en el where: si en el medio otra venta ya lo ató a una ficha, no se pisa.
  if (pedidos.length > 0) {
    await tx.order.updateMany({ where: { tenantId, id: { in: pedidos }, clientId: null }, data: { clientId: creada.id } });
  }
  return { ok: true, id: creada.id, pedidos };
}
