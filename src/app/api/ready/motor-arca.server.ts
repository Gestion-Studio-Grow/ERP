// ============================================================================
// MEDICIÓN DEL MOTOR ARCA — la parte que sí toca la base (para /api/ready).
// ============================================================================
//
// CÓMO MIDE SIN EVADIR RLS. Igual que el cron de ARCA (src/lib/cron/negocios.ts): recorre los ids
// de `Tenant` (tabla sin RLS) y mide cada negocio PARADO EN ÉL, con `tenantTransaction`. Nunca una
// lectura de todos a la vez sobre "OutboxEvent"/"Invoice": con la conexión sujeta a RLS volvería
// vacía y sin error, y el semáforo diría «ok» con la facturación trabada.
//
// CUÁNTO CUESTA (Neon plan free). Dos SELECT agregados por negocio, sólo si la facturación está
// encendida, y el resultado se guarda CACHE_MS en memoria de la instancia. /api/ready es para el
// smoke post-deploy y para mirar a mano; el monitor de uptime va contra /api/health, que no toca la
// base (docs/runbooks/facturacion/monitoreo.md).
//
// Si medir falla o tarda más de TIMEOUT_MS, no se cae /api/ready: el bloque ARCA dice
// "sin-medicion" / "medicion-incompleta" y el detalle va al log estructurado (sin datos de negocio).

import { tenantTransaction } from "@/lib/rls";
import { idsDeLosNegocios } from "@/lib/cron/negocios";
import { OUTBOX_INVOICE_CREATED } from "@/lib/invoice-core";
import { logger } from "@/lib/logger";
import {
  UMBRAL_TRABADO,
  facturacionEncendida,
  resumirMotorArca,
  type EstadoMotorArca,
  type HechosNegocio,
} from "./motor-arca";

/** Cuánto vale una medición antes de volver a la base. */
export const CACHE_MS = 120_000;
/** Techo de tiempo de la medición completa. */
export const TIMEOUT_MS = 5_000;

interface FilaOutbox {
  pendientes: bigint | number;
  en_duda: bigint | number;
  trabados: bigint | number;
  muertos: bigint | number;
  mas_viejo: Date | null;
}

interface FilaFacturas {
  ultimo_exito: Date | null;
  rechazos_24h: bigint | number;
}

/** Mide UN negocio, parado en él (GUC de RLS puesto por `tenantTransaction`). */
async function medirNegocio(tenantId: string): Promise<HechosNegocio> {
  return tenantTransaction(
    async (tx) => {
      // "En duda": tiene número anotado para ARCA (`intentoArca`, ENG-020), no está cerrado y
      // ningún despacho lo tiene reservado ahora (sin reserva o reserva vencida).
      const [o] = await tx.$queryRaw<FilaOutbox[]>`
        SELECT
          count(*) FILTER (WHERE "processedAt" IS NULL AND "muertoEn" IS NULL) AS pendientes,
          count(*) FILTER (
            WHERE "processedAt" IS NULL AND "muertoEn" IS NULL
              AND ("payload"->'intentoArca') IS NOT NULL
              AND (("payload"->'reserva') IS NULL OR ("payload"->'reserva'->>'hasta')::timestamptz <= now())
          ) AS en_duda,
          count(*) FILTER (WHERE "processedAt" IS NULL AND "muertoEn" IS NULL AND "attempts" >= ${UMBRAL_TRABADO}::int) AS trabados,
          count(*) FILTER (WHERE "processedAt" IS NULL AND "muertoEn" IS NOT NULL) AS muertos,
          min("createdAt") FILTER (WHERE "processedAt" IS NULL AND "muertoEn" IS NULL) AS mas_viejo
        FROM "OutboxEvent"
        WHERE "tenantId" = ${tenantId}::text AND "type" = ${OUTBOX_INVOICE_CREATED}`;
      const [f] = await tx.$queryRaw<FilaFacturas[]>`
        SELECT
          max("authorizedAt") FILTER (WHERE "status" = 'AUTHORIZED') AS ultimo_exito,
          count(*) FILTER (WHERE "status" = 'REJECTED' AND "updatedAt" > now() - interval '24 hours') AS rechazos_24h
        FROM "Invoice"
        WHERE "tenantId" = ${tenantId}::text`;
      return {
        pendientes: Number(o?.pendientes ?? 0),
        enDuda: Number(o?.en_duda ?? 0),
        trabados: Number(o?.trabados ?? 0),
        muertos: Number(o?.muertos ?? 0),
        pendienteMasViejo: o?.mas_viejo ?? null,
        ultimoExito: f?.ultimo_exito ?? null,
        rechazos24h: Number(f?.rechazos_24h ?? 0),
      };
    },
    { tenantId },
  );
}

/** Seams para testear sin base. */
export interface DepsMedicion {
  ids: () => Promise<string[]>;
  medir: (tenantId: string) => Promise<HechosNegocio>;
  env: Record<string, string | undefined>;
  ahora: () => Date;
}

const DEPS_REALES: DepsMedicion = {
  ids: idsDeLosNegocios,
  medir: medirNegocio,
  env: process.env,
  ahora: () => new Date(),
};

/** Mide todos los negocios (uno por vez: no abre N conexiones de golpe contra el plan free). */
export async function medirMotorArca(deps: DepsMedicion = DEPS_REALES): Promise<EstadoMotorArca> {
  const env = deps.env;
  if (!facturacionEncendida(env)) return resumirMotorArca([], { ahora: deps.ahora(), env });

  const hechos: HechosNegocio[] = [];
  let sinMedir = 0;
  let ids: string[];
  try {
    ids = await deps.ids();
  } catch (err) {
    logger.error("health.arca", "no se pudo listar los negocios para medir ARCA", err);
    return resumirMotorArca([], { ahora: deps.ahora(), env, sinMedir: 1 });
  }
  for (const id of ids) {
    try {
      hechos.push(await deps.medir(id));
    } catch (err) {
      sinMedir += 1;
      // El tenantId va al log (interno, igual que el resto de logs del cron), nunca a la respuesta.
      logger.error("health.arca", "no se pudo medir el motor ARCA de un negocio", err, { tenantId: id });
    }
  }
  return resumirMotorArca(hechos, { ahora: deps.ahora(), env, sinMedir });
}

let cache: { hasta: number; valor: EstadoMotorArca } | null = null;
// La medición en curso se comparte: /api/ready es público, y sin esto cada request que llega mientras
// otra mide (o después de que venció el techo y la anterior sigue de fondo) lanzaría otro recorrido de
// todos los negocios contra Neon (plan gratuito).
let enCurso: Promise<EstadoMotorArca> | null = null;
/** Una medición incompleta se guarda menos tiempo: se reintenta pronto, pero no en cada request. */
const CACHE_INCOMPLETA_MS = 30_000;

/** Para tests: olvida la medición guardada. */
export function olvidarCacheMotorArca(): void {
  cache = null;
  enCurso = null;
}

function medirUnaVez(deps: DepsMedicion, ahora: Date): Promise<EstadoMotorArca> {
  if (!enCurso) {
    enCurso = medirMotorArca(deps)
      .then((valor) => {
        const ttl = valor.negociosSinMedir === 0 ? CACHE_MS : CACHE_INCOMPLETA_MS;
        cache = { hasta: deps.ahora().getTime() + ttl, valor };
        return valor;
      })
      .catch((err) => {
        logger.error("health.arca", "falló la medición del motor ARCA", err);
        const valor = resumirMotorArca([], { ahora, env: deps.env, sinMedir: 1 });
        cache = { hasta: deps.ahora().getTime() + CACHE_INCOMPLETA_MS, valor };
        return valor;
      })
      .finally(() => {
        enCurso = null;
      });
  }
  return enCurso;
}

/**
 * La medición que usa /api/ready: cacheada CACHE_MS (CACHE_INCOMPLETA_MS si quedó algún negocio sin
 * medir), compartida mientras está en curso y con techo TIMEOUT_MS. Nunca rechaza.
 */
export async function estadoMotorArca(deps: DepsMedicion = DEPS_REALES): Promise<EstadoMotorArca> {
  const ahora = deps.ahora();
  // Apagada no se mide ni se usa la caché: apagar la llave se ve en el acto, no a los 2 minutos.
  if (!facturacionEncendida(deps.env)) return resumirMotorArca([], { ahora, env: deps.env });
  if (cache && cache.hasta > ahora.getTime()) return cache.valor;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const techo = new Promise<EstadoMotorArca>((resolve) => {
    timer = setTimeout(() => {
      logger.warn("health.arca", "la medición del motor ARCA superó el techo de tiempo", { timeoutMs: TIMEOUT_MS });
      resolve(resumirMotorArca([], { ahora, env: deps.env, sinMedir: 1 }));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([medirUnaVez(deps, ahora), techo]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
