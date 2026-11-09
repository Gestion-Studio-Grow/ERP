// Lado base de datos del PIN de desbloqueo (la lógica pura y las reglas están en sesion-pin.ts).
//
// TOLERA LA MIGRACIÓN SIN APLICAR (Gate 2): sin la tabla "UserPin" Prisma tira P2021/P2022; ahí el usuario no tiene
// PIN (→ contraseña) y definirlo dice «todavía no disponible». CUALQUIER otro error se relanza: el núcleo lo
// convierte en «contraseña» (falla cerrada), nunca en un desbloqueo.

import "server-only";
import { hashPassword, verifyPassword } from "@/lib/auth-password";
import { esTablaAusente } from "@/lib/permisos-overrides";
import { prisma } from "@/lib/prisma";
import type { DependenciasDelPin, PinGuardado } from "@/lib/sesion-pin";

let avisado = false;
function avisarAusente() {
  if (avisado) return;
  avisado = true;
  console.warn("[sesion-pin] tabla UserPin ausente: nadie tiene PIN, se pide la contraseña (migración sin aplicar)");
}

export async function cargarPin(userId: string, tenantId: string): Promise<PinGuardado | null> {
  try {
    return await prisma.userPin.findFirst({ where: { userId, tenantId }, select: { pinHash: true, fallos: true } });
  } catch (e) {
    if (!esTablaAusente(e)) throw e;
    avisarAusente();
    return null;
  }
}

export async function tienePin(userId: string, tenantId: string): Promise<boolean> {
  return (await cargarPin(userId, tenantId)) !== null;
}

/** Dependencias reales del desbloqueo para el negocio del pedido. */
export function dependenciasDelPin(tenantIdDelPedido: string): DependenciasDelPin {
  return {
    tenantIdDelPedido,
    usuarioActivo: async (id, tenantId) =>
      (await prisma.user.findFirst({ where: { id, tenantId, active: true, deletedAt: null }, select: { id: true } })) !== null,
    cargarPin,
    // UPDATE condicional atómico: con N pedidos en paralelo, Postgres re-evalúa `fallos < max` sobre la fila ya
    // actualizada por el anterior, así que nunca se reservan más de `max` intentos.
    reservarIntento: async (userId, tenantId, max) => {
      const r = await prisma.userPin.updateMany({
        where: { userId, tenantId, fallos: { lt: max } },
        data: { fallos: { increment: 1 } },
      });
      return r.count === 1;
    },
    reiniciarFallos: async (userId, tenantId) => {
      await prisma.userPin.updateMany({ where: { userId, tenantId }, data: { fallos: 0 } });
    },
    verificar: verifyPassword,
  };
}

/** Ingresó con la contraseña (o Google, o clave y código): el PIN vuelve a tener todos sus intentos. Tolerante. */
export async function reiniciarFallosTrasIngreso(userId: string, tenantId: string): Promise<void> {
  try {
    await prisma.userPin.updateMany({ where: { userId, tenantId, fallos: { gt: 0 } }, data: { fallos: 0 } });
  } catch (e) {
    if (!esTablaAusente(e)) throw e;
    avisarAusente();
  }
}

/** Guarda (o reemplaza) el PIN hasheado con scrypt. false si la tabla todavía no existe. */
export async function guardarPin(userId: string, tenantId: string, pin: string): Promise<boolean> {
  const pinHash = await hashPassword(pin);
  try {
    await prisma.userPin.upsert({
      where: { userId },
      create: { userId, tenantId, pinHash, fallos: 0 },
      update: { pinHash, fallos: 0 },
    });
    return true;
  } catch (e) {
    if (!esTablaAusente(e)) throw e;
    avisarAusente();
    return false;
  }
}
