// Lado SERVIDOR de la entrega de la clave provisoria por mail (GSG-SEG-014). Lo usan el reseteo y el
// alta de persona de la consola, el alta de un negocio (wizard y configurador) y el reseteo pendiente
// que corre solo en producción (`/api/cron/claves-pendientes`). El armado y el envío están en
// `clave-temporal-mail.ts` (puro + Resend); acá sólo se ata al negocio y se audita.

import type { Prisma } from "@/generated/prisma/client";
import { operatorPrisma, enElNegocio } from "@/lib/operator-db";
import { resetOwnerPasswordCore, type OwnerResetResult } from "@/lib/owner-password-reset";
import { operatorResetPort, ownersActivos } from "@/lib/operador/owner-reset-port";
import { elegirOwner } from "@/lib/operador/elegir-owner";
import {
  AUDIT_CLAVE_MAIL_ENVIADO,
  AUDIT_CLAVE_MAIL_FALLIDO,
  ClaveNoEnviada,
  enmascararEmail,
  MAIL_NO_CONECTADO,
  enviarMailClaveTemporal,
  mailDeClavesConectado,
  urlDeIngreso,
  type EnvioClave,
  type MotivoClave,
} from "@/lib/clave-temporal-mail";

/** Espera máxima de una transacción que manda el mail adentro (el mail corta a los 10 s). */
export const TX_CON_MAIL = { timeout: 25_000, maxWait: 10_000 } as const;

export type DestinoClave = { email: string; nombre: string };

/** El enviador de UN negocio: pone su nombre y su dirección de ingreso en el mail. */
export async function enviadorDelNegocio(
  tenantId: string,
  motivo: MotivoClave,
  enviarMail: typeof enviarMailClaveTemporal = enviarMailClaveTemporal,
): Promise<(destino: DestinoClave, clave: string) => Promise<EnvioClave>> {
  const t = await operatorPrisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, subdomain: true } });
  const negocio = t?.name ?? "tu negocio";
  const urlIngreso = urlDeIngreso(t?.subdomain ?? null);
  return (destino, clave) => enviarMail({ ...destino, negocio, urlIngreso, clave, motivo });
}

/**
 * Deja en la auditoría del negocio el resultado del mail, SIN la clave (sólo el destino enmascarado).
 * Va en su propia transacción: en el reseteo, la del cambio ya se deshizo. Si la auditoría misma
 * falla, se registra en el log del server y no tapa el resultado que ve el operador.
 */
export async function auditarEntregaDeClave(
  tenantId: string,
  d: { actor: string; enviada: boolean; enviadaA?: string; motivo?: string; origen: string; userId?: string },
): Promise<void> {
  try {
    await enElNegocio(tenantId, (tx) =>
      tx.auditLog.create({
        data: {
          tenantId,
          actor: d.actor,
          action: d.enviada ? AUDIT_CLAVE_MAIL_ENVIADO : AUDIT_CLAVE_MAIL_FALLIDO,
          entity: "User",
          entityId: d.userId ?? null,
          channel: "admin",
          changes: {
            origen: d.origen,
            ...(d.enviadaA ? { enviadaA: d.enviadaA } : {}),
            ...(d.motivo ? { motivo: d.motivo } : {}),
          },
        },
        select: { id: true },
      }),
    );
  } catch {
    console.error(`[clave-temporal] no se pudo auditar la entrega de la clave (negocio ${tenantId}, ${d.origen})`);
  }
}

/** Lo que ve el operador cuando no se puede elegir a qué dueño resetear (no se tocó nada). */
function motivoSinEleccion(motivo: "sin-owner" | "varios" | "no-coincide"): string {
  return motivo === "varios"
    ? "Hay más de un dueño activo: elegí a cuál le cambiás la contraseña. No se tocó nada."
    : motivo === "no-coincide"
      ? "Esa persona no es un dueño activo de este negocio. No se tocó nada."
      : "Este negocio no tiene un dueño activo: no hay a quién resetearle la contraseña. No se tocó nada.";
}

/**
 * El reseteo con mail de UN negocio, para la consola y para el reseteo pendiente del cron. No tiene
 * guardia propia: la pone el llamador (operador) o el secreto del cron.
 */
export async function resetearClaveDelDuenioConMail(
  tenantId: string,
  quien: {
    actor: string;
    operatorSubject: string;
    extra?: Record<string, string>;
    /**
     * Control previo DENTRO de la misma transacción (el reseteo pendiente toma su candado y mira si
     * ya se hizo). Si devuelve un resultado, no se resetea nada y se devuelve ese.
     */
    antes?: (tx: Prisma.TransactionClient) => Promise<OwnerResetResult | null>;
    /**
     * A QUÉ dueño (el que el operador eligió en la ficha). Se decide DENTRO de la transacción con
     * `elegirOwner` sobre los OWNER activos, antes de escribir: sin `ownerId` y con más de uno se
     * niega (antes se tomaba al más antiguo, que podía ser otra persona); un id que no es dueño
     * activo de ESTE negocio, también.
     */
    ownerId?: string;
  },
  enviarMail: typeof enviarMailClaveTemporal = enviarMailClaveTemporal,
): Promise<OwnerResetResult> {
  if (!mailDeClavesConectado()) return { ok: false, error: MAIL_NO_CONECTADO };
  const enviar = await enviadorDelNegocio(tenantId, "reseteo", enviarMail);
  try {
    return await enElNegocio(
      tenantId,
      async (tx): Promise<OwnerResetResult> => {
        const previo = await quien.antes?.(tx);
        if (previo) return previo;
        const eleccion = elegirOwner(await ownersActivos(tx, tenantId), { ownerId: quien.ownerId });
        if (!eleccion.ok) return { ok: false, error: motivoSinEleccion(eleccion.motivo) };
        return resetOwnerPasswordCore(operatorResetPort(tx, tenantId, { ownerId: eleccion.ownerId, enviarClave: enviar }), {
          tenantId,
          operatorSubject: quien.operatorSubject,
          actor: quien.actor,
          extra: quien.extra,
        });
      },
      operatorPrisma,
      TX_CON_MAIL,
    );
  } catch (e) {
    if (!(e instanceof ClaveNoEnviada)) throw e;
    await auditarEntregaDeClave(tenantId, {
      actor: quien.actor,
      enviada: false,
      enviadaA: e.destino,
      motivo: e.motivo,
      origen: "reseteo",
    });
    return { ok: false, error: e.message };
  }
}

export type EntregaDeAlta =
  | { enviada: true; enviadaA: string }
  | { enviada: false; enviadaA: string; motivo: string };

/**
 * Después de un alta que YA se cometió (wizard, configurador): manda la provisoria al titular y deja
 * el resultado en la auditoría. Acá el mail va DESPUÉS del commit porque el alta del negocio es una
 * saga larga que no puede quedar abierta esperando la red; si el mail falla, la persona existe con
 * una clave que nadie tiene (y con cambio obligatorio): se recupera con «Resetear y mandar por mail»
 * en la ficha, que es justo el camino que la pantalla le indica al operador.
 */
export async function entregarClaveDeAlta(
  tenantId: string,
  d: { actor: string; destino: DestinoClave; clave: string; origen: string; userId?: string },
): Promise<EntregaDeAlta> {
  const enviadaA = enmascararEmail(d.destino.email);
  let envio: EnvioClave;
  try {
    const enviar = await enviadorDelNegocio(tenantId, "alta");
    envio = await enviar(d.destino, d.clave);
  } catch {
    envio = { enviado: false, motivo: "no se pudo armar el mail" };
  }
  await auditarEntregaDeClave(tenantId, {
    actor: d.actor,
    enviada: envio.enviado,
    enviadaA,
    motivo: envio.enviado ? undefined : envio.motivo,
    origen: d.origen,
    userId: d.userId,
  });
  return envio.enviado ? { enviada: true, enviadaA } : { enviada: false, enviadaA, motivo: envio.motivo };
}

/** Lo que ve el operador cuando el mail de un alta ya cometida no salió. */
export const recuperarClaveNoEnviada = (motivo: string, enviadaA: string) =>
  `El alta quedó hecha, pero el mail con la contraseña provisoria a ${enviadaA} no salió (${motivo}). ` +
  "Mandásela de nuevo desde la ficha del negocio: «Resetear y mandar por mail».";
