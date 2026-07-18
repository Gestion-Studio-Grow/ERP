/**
 * STORE del Ticket de Acceso (TA) de ARCA POR TENANT — caché persistente cifrada.
 *
 * PROBLEMA que resuelve (crítico en serverless): WSAA rechaza un segundo login
 * mientras haya un TA vigente (`coe.alreadyAuthenticated`), y el bloqueo dura
 * ~10-15 min. En Vercel cada invocación del worker es un proceso nuevo: sin
 * persistir el TA, la 2ª emisión dentro de la ventana del TA re-loguea y falla.
 * Guardar el TA (cifrado, por tenant) y reusarlo cierra el ciclo de emisión.
 *
 * 🔒 CIFRADO: el TA (token+sign) es un bearer de ~12h — se guarda CIFRADO con el
 * mismo envelope (DEK/KEK, `FISCAL_MASTER_KEY`) que el certificado (ADR-066),
 * nunca en claro. `expiration` sí va en claro (es un timestamp, no un secreto) para
 * poder descartar un TA vencido SIN descifrar.
 *
 * ⚠️ SCHEMA-AHEAD (Gate 2): la tabla `ArcaAuthTicket` es una migración PREPARADA y
 * NO aplicada (`prisma/pending-gate2/ArcaAuthTicket.sql`). Por eso NO está en
 * `schema.prisma` y se accede con SQL CRUDO DEFENSIVO: si la tabla no existe
 * todavía, el store DEGRADA a no-op (leer→undefined, guardar→nada) en vez de
 * tumbar la emisión con un 42P01 (mismo criterio que `MustChangePassword`/
 * `ProvisioningRun`). Sin caché, la emisión igual funciona: a lo sumo re-loguea.
 *
 * Es CONTROL-PLANE (cross-tenant, como la credencial): solo lo toca `operatorPrisma`.
 */

import { randomUUID } from "node:crypto";
import { operatorPrisma } from "@/lib/operator-db";
import { logger } from "@/lib/logger";
import { ticketVigente, type TicketAcceso } from "@/plugins/arca";
import {
  masterKeyDesdeEnv,
  sealSecret,
  openSecret,
  type MasterKey,
} from "./cert-crypto";

const SERVICIO_WSFE = "wsfe";

/** Fila persistida del TA (material cifrado + expiration en claro). */
interface FilaTicket {
  kekId: string;
  wrappedDek: string;
  sealed: string;
  expiration: string;
}

/** Seams inyectables (default: operatorPrisma + master key de env) → testeable sin DB. */
export interface ArcaTaStoreDeps {
  /** ¿Existe la tabla `ArcaAuthTicket`? (migración Gate 2 aplicada). */
  tablaExiste: () => Promise<boolean>;
  leerFila: (tenantId: string, servicio: string) => Promise<FilaTicket | null>;
  upsertFila: (
    tenantId: string,
    servicio: string,
    fila: FilaTicket,
  ) => Promise<void>;
  master: () => MasterKey;
  ahora: () => Date;
}

// Memoizado por vida del proceso: `to_regclass` es barato pero se llama por emisión.
// Un deploy reinicia el módulo → si el dueño aplica la migración y redespliega, se
// re-evalúa. Solo cachea el `true`/`false`; ante error de la query NO cachea.
let tablaExisteCache: boolean | undefined;

async function tablaExisteReal(): Promise<boolean> {
  if (tablaExisteCache !== undefined) return tablaExisteCache;
  try {
    const rows = await operatorPrisma.$queryRaw<{ existe: boolean }[]>`
      SELECT to_regclass('public."ArcaAuthTicket"') IS NOT NULL AS existe
    `;
    tablaExisteCache = rows[0]?.existe === true;
    return tablaExisteCache;
  } catch {
    // Ante cualquier problema, tratamos la tabla como ausente (no cacheamos): el
    // store degrada a no-op y la emisión sigue (re-loguea). Fail-safe.
    return false;
  }
}

function defaultDeps(): ArcaTaStoreDeps {
  return {
    tablaExiste: tablaExisteReal,
    leerFila: async (tenantId, servicio) => {
      const rows = await operatorPrisma.$queryRaw<FilaTicket[]>`
        SELECT "kekId", "wrappedDek", "sealed", "expiration"
        FROM "ArcaAuthTicket"
        WHERE "tenantId" = ${tenantId} AND "service" = ${servicio}
        LIMIT 1
      `;
      return rows[0] ?? null;
    },
    upsertFila: async (tenantId, servicio, fila) => {
      await operatorPrisma.$executeRaw`
        INSERT INTO "ArcaAuthTicket"
          ("id", "tenantId", "service", "kekId", "wrappedDek", "sealed", "expiration", "createdAt", "updatedAt")
        VALUES
          (${randomUUID()}, ${tenantId}, ${servicio}, ${fila.kekId}, ${fila.wrappedDek}, ${fila.sealed}, ${fila.expiration}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("tenantId") DO UPDATE SET
          "service"    = EXCLUDED."service",
          "kekId"      = EXCLUDED."kekId",
          "wrappedDek" = EXCLUDED."wrappedDek",
          "sealed"     = EXCLUDED."sealed",
          "expiration" = EXCLUDED."expiration",
          "updatedAt"  = CURRENT_TIMESTAMP
      `;
    },
    master: masterKeyDesdeEnv,
    ahora: () => new Date(),
  };
}

/**
 * Devuelve el TA persistido y VIGENTE del tenant, o `undefined` si no hay, venció,
 * o la tabla todavía no existe (Gate 2 sin aplicar). Descifra el token+sign; el
 * chequeo de vigencia se hace ANTES de descifrar (expiration va en claro).
 */
export async function leerTicketAcceso(
  tenantId: string,
  deps: ArcaTaStoreDeps = defaultDeps(),
): Promise<TicketAcceso | undefined> {
  if (!(await deps.tablaExiste())) return undefined;

  const fila = await deps.leerFila(tenantId, SERVICIO_WSFE);
  if (!fila) return undefined;

  // Descartar un TA vencido sin gastar un descifrado (expiration está en claro).
  if (!ticketVigente({ token: "", sign: "", expiration: fila.expiration }, deps.ahora())) {
    return undefined;
  }

  try {
    const { token, sign } = JSON.parse(
      openSecret({ kekId: fila.kekId, wrappedDek: fila.wrappedDek, sealed: fila.sealed }, deps.master()),
    ) as { token: string; sign: string };
    if (!token || !sign) return undefined;
    return { token, sign, expiration: fila.expiration };
  } catch (e) {
    // Sobre corrupto / master key equivocada: tratamos como "sin caché" → re-loguea.
    logger.warn("arca.ta", "No se pudo abrir el TA persistido; se re-autenticará", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return undefined;
  }
}

/**
 * Persiste (cifrado) el TA de un tenant para reusarlo entre invocaciones. No-op si
 * la tabla no existe (Gate 2 sin aplicar). Best-effort: cualquier fallo se loguea y
 * se traga — persistir el TA es optimización, no puede tumbar la emisión.
 */
export async function guardarTicketAcceso(
  tenantId: string,
  ta: TicketAcceso,
  deps: ArcaTaStoreDeps = defaultDeps(),
): Promise<void> {
  try {
    if (!(await deps.tablaExiste())) return;
    const sobre = sealSecret(JSON.stringify({ token: ta.token, sign: ta.sign }), deps.master());
    await deps.upsertFila(tenantId, SERVICIO_WSFE, {
      kekId: sobre.kekId,
      wrappedDek: sobre.wrappedDek,
      sealed: sobre.sealed,
      expiration: ta.expiration,
    });
  } catch (e) {
    logger.warn("arca.ta", "No se pudo persistir el TA (se re-logueará la próxima)", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
