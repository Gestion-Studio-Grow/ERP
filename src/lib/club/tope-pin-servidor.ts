// ============================================================================
// TOPE DE INTENTOS DEL PIN DE DUEÑO EN LA BASE (GSG-SEG-020) — sin migración, en AuditLog.
// ============================================================================
//
// El PIN de un dueño del club se verifica sólo en el servidor (pin-servidor.ts). La escalera es la del motor (espera
// de 30 s, 2 min, 10 min; los fallos se olvidan a las 8 h sin fallos), en tres baldes:
//   · por dueño: 5 fallos dirigidos a ESE dueño; sólo un acierto de ese dueño los limpia;
//   · sin dueño («¿de qué dueño es?»): 5 fallos; ningún acierto los limpia;
//   · techo del negocio: 20 fallos de cualquiera; ningún acierto lo limpia.
// Un intento sin dueño se prueba contra todos: su fallo cuenta en `sinUsuario` y en el balde de cada dueño anotado, y
// el balde de un dueño nace con los fallos vigentes de `sinUsuario`. Así, contra un mismo dueño nunca se evalúan más
// de 5 entre ambos tipos antes de la primera espera. Un intento espera si espera el techo, `sinUsuario` o su balde (sin
// dueño: el de cualquier dueño). Un acierto que
// no habilita (PIN del largo viejo) no limpia nada. Durante la espera no se verifica nada (ni se calcula ningún hash)
// y se responde lo mismo, sea el PIN que sea. El código de aprobación tiene su propio tope (sin dueño + techo).
//
// Dónde: una fila de `AuditLog` por negocio y ámbito (`entity: "ClubPinIntento"`, `entityId: <tenantId>` para el
// PIN y `<tenantId>:codigo` para los códigos de aprobación), con el estado del tope en `changes` (`intentos` = techo,
// `sinUsuario`, `porDuenio`). Cada
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
import { ESPERAS_PIN_S, TOPE_INTENTOS_PIN, esperaPin, intentosPin, type IntentosPin } from "./motor.mjs";
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

/** Fallos por balde (un dueño, o los intentos sin dueño) antes de cada espera: los del motor. */
const TOPE_POR_BALDE = TOPE_INTENTOS_PIN;
/** Fallos de todo el negocio (cualquier dueño o sin dueño) antes de cada espera. Ningún acierto lo limpia. */
export const TECHO_FALLOS_NEGOCIO = 20;
/** Los fallos se olvidan después de 8 h sin fallos (como en el motor). */
const OLVIDO_MS = 8 * 60 * 60 * 1000;

/** Lo que dice `verificar`: si acertó y, si el acierto limpia, el dueño cuyos fallos limpia. */
export interface IntentoVerificado {
  ok: boolean;
  limpia?: string | null;
}

interface EstadoDelTope {
  /** Techo del negocio: todos los fallos. */
  intentos: IntentosPin;
  /** Los intentos que no dicen de qué dueño son (y todo el ámbito «codigo»). */
  sinUsuario: IntentosPin;
  /** Los dirigidos a un dueño. */
  porDuenio: Map<string, IntentosPin>;
}

function leerEstado(c: unknown): EstadoDelTope {
  const x = (c && typeof c === "object" ? c : {}) as { intentos?: unknown; sinUsuario?: unknown; porDuenio?: unknown };
  const porDuenio = new Map<string, IntentosPin>();
  if (x.porDuenio && typeof x.porDuenio === "object" && !Array.isArray(x.porDuenio)) {
    for (const [id, t] of Object.entries(x.porDuenio)) porDuenio.set(id, intentosPin(t));
  }
  return { intentos: intentosPin(x.intentos ?? null), sinUsuario: intentosPin(x.sinUsuario ?? null), porDuenio };
}

const guardable = (e: EstadoDelTope) => ({ intentos: e.intentos, sinUsuario: e.sinUsuario, porDuenio: Object.fromEntries(e.porDuenio) });

/** Un fallo más en un balde (la escalera del motor: 30 s, 2 min, 10 min), con `tope` fallos por tanda. */
/** Los fallos de un balde que todavía cuentan para su próxima espera (ni olvidados ni de una tanda ya esperada). */
function fallosVigentes(t: IntentosPin, tope: number, ahora: number): number {
  const x = intentosPin(t);
  if (x.ultimoFallo && ahora - x.ultimoFallo >= OLVIDO_MS) return 0;
  if (x.fallos >= tope && ahora >= x.esperaHasta) return 0;
  return x.fallos;
}

/** El balde de un dueño; si no hay, nace con los fallos sin dueño vigentes (también se probaron contra él). */
function baldeDe(e: EstadoDelTope, usuarioId: string, ahora: number): IntentosPin {
  return e.porDuenio.get(usuarioId) ?? { ...intentosPin(null), fallos: fallosVigentes(e.sinUsuario, TOPE_POR_BALDE, ahora) };
}

function anotarFallo(t: IntentosPin, tope: number, ahora: number): IntentosPin {
  let x = intentosPin(t);
  if (x.ultimoFallo && ahora - x.ultimoFallo >= OLVIDO_MS) x = intentosPin(null);
  if (x.fallos >= tope && ahora >= x.esperaHasta) x.fallos = 0; // ya esperó: arranca otra tanda
  x.fallos += 1;
  x.ultimoFallo = ahora;
  if (x.fallos >= tope) {
    x.tandas += 1;
    x.esperaHasta = ahora + ESPERAS_PIN_S[Math.min(x.tandas, ESPERAS_PIN_S.length) - 1] * 1000;
  }
  return x;
}

/**
 * Cuánto falta esperar para un intento contra `usuarioId` (o sin dueño): el techo, el de los intentos sin dueño (que
 * también se probaron contra ese dueño) y su balde. Sin dueño se prueba contra todos: cuentan los baldes de cada dueño.
 */
function esperaDe(e: EstadoDelTope, usuarioId: string | null, ahora: number): number {
  const baldes = [e.intentos, e.sinUsuario, ...(usuarioId ? [e.porDuenio.get(usuarioId)] : e.porDuenio.values())];
  return Math.max(0, ...baldes.map((b) => (b ? esperaPin(b, ahora) : 0)));
}

/** Saca los baldes de dueño que ya no cuentan (olvidados y sin espera). */
function podar(e: EstadoDelTope, ahora: number): void {
  for (const [id, b] of e.porDuenio) {
    if (!b.fallos || (ahora - b.ultimoFallo >= OLVIDO_MS && esperaPin(b, ahora) === 0)) e.porDuenio.delete(id);
  }
}

/**
 * Verifica con tope: si el intento tiene que esperar, no llama a `verificar`. Si no, la llama, anota el intento y
 * devuelve cuánto queda por esperar (0 si nada). `usuarioId`: el dueño contra el que se prueba (null = sin dueño).
 * Un fallo cuenta en el techo del negocio y en su balde (sin dueño: también en el de cada dueño anotado); un acierto
 * sólo limpia el balde del dueño de `limpia`.
 */
export async function conTopeDePin<T extends IntentoVerificado>(
  tenantId: string,
  ambito: AmbitoDelTope,
  verificar: () => T | Promise<T>,
  opciones: { usuarioId?: string | null; ahoraMs?: number; correr?: CorrerEnElNegocio } = {},
): Promise<ResultadoDelTope<T>> {
  const correr = opciones.correr ?? correrConRls;
  const ahora = opciones.ahoraMs ?? Date.now();
  const usuarioId = ambito === "pin" && typeof opciones.usuarioId === "string" && opciones.usuarioId ? opciones.usuarioId : null;
  const clave = claveDelTope(tenantId, ambito);
  return correr(tenantId, async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`club-pin:${clave}`}))`;
    const donde = { tenantId, entity: ENTIDAD_PIN_INTENTO, entityId: clave };
    const fila = await db.auditLog.findFirst({ where: donde, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { changes: true } });
    const estado = leerEstado(fila?.changes ?? null);
    const espera = esperaDe(estado, usuarioId, ahora);
    if (espera > 0) return { espera: true as const, esperaS: Math.ceil(espera / 1000) };
    const antes = JSON.stringify(guardable(estado));
    const resultado = await verificar();
    if (!resultado.ok) {
      estado.intentos = anotarFallo(estado.intentos, TECHO_FALLOS_NEGOCIO, ahora);
      if (usuarioId) estado.porDuenio.set(usuarioId, anotarFallo(baldeDe(estado, usuarioId, ahora), TOPE_POR_BALDE, ahora));
      else {
        estado.sinUsuario = anotarFallo(estado.sinUsuario, TOPE_POR_BALDE, ahora);
        for (const [id, b] of estado.porDuenio) estado.porDuenio.set(id, anotarFallo(b, TOPE_POR_BALDE, ahora));
      }
    } else if (ambito === "pin" && typeof resultado.limpia === "string") {
      estado.porDuenio.delete(resultado.limpia);
    }
    podar(estado, ahora);
    const despues = guardable(estado);
    if (JSON.stringify(despues) !== antes) {
      await db.auditLog.deleteMany({ where: donde });
      await db.auditLog.create({
        data: {
          ...donde,
          actor: "sistema:club-pin",
          action: resultado.ok ? "acierto" : "fallo",
          changes: despues as unknown as Prisma.InputJsonValue,
          channel: "admin",
        },
      });
    }
    return { espera: false as const, resultado, esperaS: Math.ceil(esperaDe(estado, usuarioId, ahora) / 1000) };
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
