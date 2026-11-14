// ============================================================================
// TOPE DE INTENTOS DEL PIN DE DUEÑO EN LA BASE (GSG-SEG-020) — sin migración, en AuditLog.
// ============================================================================
//
// El PIN de un dueño del club se verifica sólo en el servidor (pin-servidor.ts). Los intentos cuentan POR NEGOCIO
// (no por dueño): las reglas son las del motor (`anotarIntentoPin`: 5 fallos → espera de 30 s, 2 min, 10 min; se
// olvidan a las 8 h sin fallos; sólo un acierto de dueño los limpia). Durante la espera no se verifica nada (ni se
// calcula ningún hash) y se responde lo mismo, sea el PIN que sea.
//
// Dónde: una fila de `AuditLog` por negocio y ámbito (`entity: "ClubPinIntento"`, `entityId: <tenantId>` para el
// PIN y `<tenantId>:codigo` para los códigos de aprobación), con el estado del tope en `changes.intentos`. Cada
// intento reemplaza la fila (queda una sola). Todo en `tenantTransaction` (RLS) con un candado de transacción
// (`pg_advisory_xact_lock`) por negocio y ámbito: dos intentos a la vez no se saltean el tope. La purga de la
// auditoría puede borrarla: la ventana del tope es de 8 h.
//
// Re-hash fuerte: al acertar con un PIN guardado h1 (o en claro), se anota `entity: "ClubPinFuerte"`,
// `entityId: <usuario del club>`, `changes: { de: huella del guardado, h2 }`. No se escribe la foto al verificar; el
// próximo guardado de la foto (cualquier sesión) lo aplica (`reponerPinesDeDuenio`).
//
// Claves: derivadas de AUTH_SECRET con su propio uso (patrón de src/lib/rendiciones/pin.server.ts). Sin AUTH_SECRET
// en producción `authSecret()` tira: queda cerrado.
//
// — Elaborado por GSG
//
// design-lint-ignore: sin interfaz ni animación; el lint toma `Buffer.from(` por el `.from(` de gsap (reducedMotion N/A).

import { hkdfSync } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { authSecret } from "@/lib/auth";
import { anotarIntentoPin, esperaPin, intentosPin, type IntentosPin } from "./motor.mjs";
import type { PinesFuertes } from "./pin-servidor";

export const ENTIDAD_PIN_INTENTO = "ClubPinIntento";
export const ENTIDAD_PIN_FUERTE = "ClubPinFuerte";

export type AmbitoDelTope = "pin" | "codigo";

type Db = Pick<Prisma.TransactionClient, "auditLog" | "$executeRaw">;

/** Corre `fn` en una transacción del negocio (RLS). Se reemplaza en los tests sin base. */
export type CorrerEnElNegocio = <T>(tenantId: string, fn: (db: Db) => Promise<T>) => Promise<T>;

const correrConRls: CorrerEnElNegocio = async (tenantId, fn) => {
  const { tenantTransaction } = await import("@/lib/rls");
  return tenantTransaction((tx) => fn(tx), { tenantId });
};

/** La clave de los pases (120 s) de firma y aprobación del dueño. */
export const clavePase = (): Buffer => Buffer.from(hkdfSync("sha256", authSecret(), "club-pin-pase", "pase", 32));
/** La clave del código de aprobación del servidor. */
export const claveAprobacion = (): Buffer => Buffer.from(hkdfSync("sha256", authSecret(), "club-aprobacion", "codigo", 32));

const claveDelTope = (tenantId: string, ambito: AmbitoDelTope) => (ambito === "pin" ? tenantId : `${tenantId}:codigo`);

export type ResultadoDelTope<T> = { espera: true; esperaS: number } | { espera: false; resultado: T; esperaS: number };

/**
 * Verifica con tope: si el negocio está esperando, no llama a `verificar`. Si no, la llama, anota el intento y
 * devuelve cuánto queda por esperar (0 si nada). `verificar` dice si acertó y si quien acertó es un dueño.
 */
export async function conTopeDePin<T extends { ok: boolean; duenio?: boolean }>(
  tenantId: string,
  ambito: AmbitoDelTope,
  verificar: () => T | Promise<T>,
  opciones: { ahoraMs?: number; correr?: CorrerEnElNegocio } = {},
): Promise<ResultadoDelTope<T>> {
  const correr = opciones.correr ?? correrConRls;
  const ahora = opciones.ahoraMs ?? Date.now();
  const clave = claveDelTope(tenantId, ambito);
  return correr(tenantId, async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`club-pin:${clave}`}))`;
    const donde = { tenantId, entity: ENTIDAD_PIN_INTENTO, entityId: clave };
    const fila = await db.auditLog.findFirst({ where: donde, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { changes: true } });
    const antes = intentosPin((fila?.changes as { intentos?: Partial<IntentosPin> } | null)?.intentos ?? null);
    const espera = esperaPin(antes, ahora);
    if (espera > 0) return { espera: true as const, esperaS: Math.ceil(espera / 1000) };
    const resultado = await verificar();
    const despues = anotarIntentoPin(antes, { ok: resultado.ok, duenio: !!resultado.duenio }, ahora);
    if (JSON.stringify(despues) !== JSON.stringify(antes)) {
      await db.auditLog.deleteMany({ where: donde });
      await db.auditLog.create({
        data: {
          ...donde,
          actor: "sistema:club-pin",
          action: resultado.ok ? "acierto-duenio" : "fallo",
          changes: { intentos: despues } as unknown as Prisma.InputJsonValue,
          channel: "admin",
        },
      });
    }
    return { espera: false as const, resultado, esperaS: Math.ceil(esperaPin(despues, ahora) / 1000) };
  });
}

/** Los h2 pendientes del negocio (usuario del club → { de, h2 }). */
export async function leerPinesFuertes(tenantId: string, correr: CorrerEnElNegocio = correrConRls): Promise<Map<string, { de: string; h2: string }>> {
  const filas = await correr(tenantId, (db) =>
    db.auditLog.findMany({ where: { tenantId, entity: ENTIDAD_PIN_FUERTE }, orderBy: { createdAt: "asc" }, select: { entityId: true, changes: true } }),
  );
  const out = new Map<string, { de: string; h2: string }>();
  for (const f of filas) {
    const c = f.changes as { de?: unknown; h2?: unknown } | null;
    if (f.entityId && typeof c?.de === "string" && typeof c.h2 === "string") out.set(f.entityId, { de: c.de, h2: c.h2 });
  }
  return out;
}

/** Anota (reemplaza) el h2 pendiente de un usuario del club. */
export async function anotarPinFuerte(tenantId: string, usuarioId: string, de: string, h2: string, correr: CorrerEnElNegocio = correrConRls): Promise<void> {
  await correr(tenantId, async (db) => {
    await db.auditLog.deleteMany({ where: { tenantId, entity: ENTIDAD_PIN_FUERTE, entityId: usuarioId } });
    await db.auditLog.create({
      data: { tenantId, actor: "sistema:club-pin", action: "pendiente", entity: ENTIDAD_PIN_FUERTE, entityId: usuarioId, changes: { de, h2 }, channel: "admin" },
    });
  });
}

/** Borra los h2 pendientes que ya se aplicaron o quedaron viejos. */
export async function borrarPinesFuertes(tenantId: string, usuarioIds: readonly string[], correr: CorrerEnElNegocio = correrConRls): Promise<void> {
  if (!usuarioIds.length) return;
  await correr(tenantId, (db) => db.auditLog.deleteMany({ where: { tenantId, entity: ENTIDAD_PIN_FUERTE, entityId: { in: [...usuarioIds] } } }));
}

/** Los usuarios cuyo h2 pendiente ya no corresponde al PIN guardado en `textoGuardado` (aplicado o viejo). */
export function fuertesParaBorrar(fuertes: PinesFuertes, guardadoDe: (usuarioId: string) => string | undefined, huella: (g: string) => string): string[] {
  const out: string[] = [];
  for (const [id, f] of fuertes) {
    const g = guardadoDe(id);
    if (!g || huella(g) !== f.de) out.push(id);
  }
  return out;
}
