// ============================================================================
// FACTOQUE · «Conectá tu Mercado Pago» — la conexión OAuth por negocio.
// ============================================================================
//
// Reusa la suite de integraciones, no duplica nada:
//   · la conexión es una fila de IntegracionConexion (conector "mercadopago", cuentaExterna = el
//     user_id de MP) creada con `crearConexion`: credenciales selladas AES-256-GCM con AAD
//     tenantId|conexionId|campo, KEK `INTEGRACIONES_MASTER_KEY`, una sola activa por negocio, y
//     la misma cuenta de MP en OTRO negocio choca en la base («cuenta_en_uso»);
//   · el `access_token` queda donde ya lo busca el dispatch de cobros (pagos-dispatch.ts,
//     `conexionDelNegocio` + `leerCredencial`): los cobros del negocio quedan listos para
//     leerse/facturarse con el motor que ya existe (MP_PAYMENT, invoice-from-mp.ts). Esta tarea NO
//     factura nada automático.
//
// Sin schema nuevo: todo entra en tablas que ya existen (migración 20260925120000_lanzamiento_base).

import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import {
  ConexionError,
  conexionDelNegocio,
  crearConexion,
  darDeBajaConexion,
  renovarConexionOAuth,
  versionDeCredenciales,
  type ResultadoRenovacion,
} from "@/integraciones/conexiones.server";
import { claveMaestraDesdeEntorno } from "@/integraciones/secretos";
import { CAMPO_SECRETO_WEBHOOK_MP, CAMPO_TOKEN_MP } from "@/plugins/mercadopago/conector";
import {
  CONFIG_FACTURACION_MP_APAGADA,
  configDeLaConexion,
  validarConfigFacturacionMP,
  type ConfigFacturacionMP,
} from "@/lib/mercadopago-clasificacion";
import {
  OAuthMPError,
  configOAuthMP,
  hayQueRenovar,
  refrescarTokenMP,
  type ConfigOAuthMP,
  type PedirMP,
  type TokensMP,
} from "@/plugins/mercadopago/oauth-mp";

export const CONECTOR_MP = "mercadopago";
export const CAMPO_REFRESH_MP = "refresh_token";

type Env = Record<string, string | undefined>;

/** ¿Se puede ofrecer «Conectar»? Hacen falta la app de MP de GSG y la llave de las credenciales. */
export function conexionMPDisponible(env: Env = process.env): ConfigOAuthMP | null {
  const cfg = configOAuthMP(env);
  if (!cfg) return null;
  try {
    claveMaestraDesdeEntorno(env);
  } catch {
    return null;
  }
  return cfg;
}

export type EstadoMP =
  | { conectado: false }
  | { conectado: true; cuenta: string; desde: Date; problema: "ninguno" | "reconectar" };

/** El estado para la pantalla. No abre ningún secreto (no necesita la KEK). */
export async function estadoMPDelNegocio(tenantId: string): Promise<EstadoMP> {
  const fila = await tenantTransaction(
    (tx) =>
      tx.integracionConexion.findFirst({
        where: { tenantId, conector: CONECTOR_MP, estado: { in: ["conectada", "con_problemas", "requiere_reconectar"] } },
        orderBy: { createdAt: "desc" },
        select: { tenantId: true, cuentaExterna: true, estado: true, updatedAt: true },
      }),
    { tenantId },
  );
  if (!fila || fila.tenantId !== tenantId) return { conectado: false };
  return {
    conectado: true,
    cuenta: fila.cuentaExterna ?? "",
    desde: fila.updatedAt,
    problema: fila.estado === "conectada" ? "ninguno" : "reconectar",
  };
}

export type ResultadoGuardarMP = { ok: true } | { ok: false; motivo: "cuenta_en_uso" | "sin_clave" | "error" };

/** Guarda lo que devolvió el canje del código: conexión + tokens sellados, y la auditoría. */
export async function guardarConexionMP(
  tenantId: string,
  userId: string,
  tokens: TokensMP,
  cfg: ConfigOAuthMP,
  env: Env = process.env,
): Promise<ResultadoGuardarMP> {
  try {
    await crearConexion(
      tenantId,
      CONECTOR_MP,
      {
        cuentaExterna: tokens.cuentaMp,
        etiqueta: `Mercado Pago · cuenta ${tokens.cuentaMp}`,
        conectadaPor: `user:${userId}`,
        credenciales: {
          [CAMPO_TOKEN_MP]: tokens.accessToken,
          [CAMPO_REFRESH_MP]: tokens.refreshToken,
          // Con OAuth, MP firma los avisos con la clave de la app de GSG (la misma para todos los
          // negocios); el conector la busca en la conexión, así que se guarda sellada acá.
          [CAMPO_SECRETO_WEBHOOK_MP]: cfg.webhookSecret,
        },
        vencen: { [CAMPO_TOKEN_MP]: tokens.expiraEn },
      },
      { env },
    );
  } catch (e) {
    if (e instanceof ConexionError && e.motivo === "cuenta_en_uso") return { ok: false, motivo: "cuenta_en_uso" };
    if (e instanceof ConexionError && e.motivo === "sin_clave_maestra") return { ok: false, motivo: "sin_clave" };
    logger.error("facturita", "no se pudo guardar la conexión de Mercado Pago", e, { tenantId });
    return { ok: false, motivo: "error" };
  }
  await activarModuloMP(tenantId);
  await auditar(tenantId, userId, "facturita.mercadopago_conectado", { cuenta: tokens.cuentaMp });
  return { ok: true };
}

/**
 * Desconectar = borrar. Las credenciales se van de la base con sus DEK (no quedan ni selladas).
 * MP no publica un endpoint para revocar el permiso desde la app: la pantalla le explica a la
 * persona cómo sacarlo también del lado de Mercado Pago.
 */
export async function desconectarMP(tenantId: string, userId: string): Promise<number> {
  const n = await darDeBajaConexion(tenantId, CONECTOR_MP);
  if (n > 0) await auditar(tenantId, userId, "facturita.mercadopago_desconectado", { conexiones: n });
  return n;
}

/**
 * Renueva el access token si vence en menos de 15 días. Un solo renovador gana (candado + `tokenVersion`);
 * si MP rechaza el refresh, la conexión queda «requiere_reconectar» y la pantalla lo dice.
 * Nunca lanza: lo peor es que siga con el token que tenía.
 */
export async function renovarMPSiHaceFalta(
  tenantId: string,
  deps: { env?: Env; pedir?: PedirMP; ahora?: Date } = {},
): Promise<ResultadoRenovacion> {
  const env = deps.env ?? process.env;
  const ahora = deps.ahora ?? new Date();
  const cfg = conexionMPDisponible(env);
  if (!cfg) return "no_hacia_falta";
  try {
    const cx = await conexionDelNegocio(tenantId, CONECTOR_MP);
    if (!cx) return "no_hacia_falta";
    const v = await versionDeCredenciales(tenantId, cx.conexionId, CAMPO_TOKEN_MP);
    if (!v || !hayQueRenovar(v.expiraEn, ahora)) return "no_hacia_falta";
    // El candado de `renovarConexionOAuth` cubre releer → pedir a MP → guardar: el que pierde
    // espera, relee y NO le manda a MP el mismo refresh_token (sigue con el token del ganador).
    const pedir = deps.pedir ?? (fetch as unknown as PedirMP);
    return await renovarConexionOAuth(
      tenantId,
      CONECTOR_MP,
      cx.conexionId,
      {
        versionVista: v.tokenVersion,
        campoVence: CAMPO_TOKEN_MP,
        campoRefresh: CAMPO_REFRESH_MP,
        hayQueRenovar: (expiraEn) => hayQueRenovar(expiraEn, ahora),
        yaVencio: (expiraEn) => !!expiraEn && expiraEn.getTime() <= ahora.getTime(),
        pedir: async (refresh) => {
          let t: TokensMP;
          try {
            t = await refrescarTokenMP(cfg, refresh, pedir, ahora);
          } catch (e) {
            logger.warn("facturita", "no se pudo renovar el token de Mercado Pago", { tenantId, motivo: e instanceof OAuthMPError ? e.motivo : "error" });
            // Sólo un «no» de MP al refresh (400/401/403) pide reconectar; un 429 o un 5xx es pasajero.
            const rechazo = e instanceof OAuthMPError && e.motivo === "rechazado" && [400, 401, 403].includes(e.estadoHttp ?? 0);
            return { tipo: rechazo ? "rechazado" : "fallo" };
          }
          // La cuenta tiene que ser la misma: un refresh nunca cambia de dueño la conexión.
          if (t.cuentaMp !== cx.cuentaExterna) return { tipo: "fallo" };
          return {
            tipo: "renovado",
            valores: { [CAMPO_TOKEN_MP]: { valor: t.accessToken, expiraEn: t.expiraEn }, [CAMPO_REFRESH_MP]: { valor: t.refreshToken } },
          };
        },
      },
      { env },
    );
  } catch (e) {
    logger.error("facturita", "renovación de Mercado Pago", e, { tenantId });
    return "fallo";
  }
}

/**
 * Conectar es el permiso del negocio: suma el módulo «mercadopago» (si no lo tenía) para que los
 * avisos de esa conexión no se rechacen por `conMercadoPagoActivo`. Idempotente, dentro del negocio.
 * Desconectar NO lo saca: sin conexión no llega ningún aviso, y el historial sigue visible.
 */
async function activarModuloMP(tenantId: string): Promise<void> {
  try {
    await tenantTransaction(
      async (tx) => {
        const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { modules: true } });
        if (!t || t.modules.includes(CONECTOR_MP)) return;
        await tx.tenant.update({ where: { id: tenantId }, data: { modules: { push: CONECTOR_MP } } });
      },
      { tenantId },
    );
  } catch (e) {
    logger.error("facturita", "no se pudo activar el módulo de Mercado Pago", e, { tenantId });
  }
}

// ── Configuración de la facturación de lo que entra por MP (PR2) ─────────────

/** La configuración del negocio (de su conexión activa). Sin conexión o rara → apagada. */
export async function configFacturacionMPDelNegocio(tenantId: string): Promise<ConfigFacturacionMP> {
  const fila = await tenantTransaction(
    (tx) =>
      tx.integracionConexion.findFirst({
        where: { tenantId, conector: CONECTOR_MP, estado: { in: ["conectada", "con_problemas", "requiere_reconectar"] } },
        orderBy: { createdAt: "desc" },
        select: { tenantId: true, config: true },
      }),
    { tenantId },
  );
  return fila && fila.tenantId === tenantId ? configDeLaConexion(fila.config) : CONFIG_FACTURACION_MP_APAGADA;
}

export type ResultadoConfigMP =
  | { ok: true; config: ConfigFacturacionMP }
  | { ok: false; motivo: "sin_conexion" }
  | { ok: false; motivo: "invalida"; errores: Partial<Record<keyof ConfigFacturacionMP, string>> };

/**
 * Guarda la configuración en la conexión activa del negocio (JSON no secreto, sin migración).
 * Conserva el resto de `config`. Auditada con el antes y el después.
 */
export async function guardarConfigFacturacionMP(tenantId: string, userId: string, crudo: unknown): Promise<ResultadoConfigMP> {
  const v = validarConfigFacturacionMP(crudo);
  if (!v.ok) return { ok: false, motivo: "invalida", errores: v.errores };
  const r = await tenantTransaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`integracion-conexion:${tenantId}:${CONECTOR_MP}`}))`;
      const fila = await tx.integracionConexion.findFirst({
        where: { tenantId, conector: CONECTOR_MP, estado: { in: ["conectada", "con_problemas", "requiere_reconectar"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, tenantId: true, config: true },
      });
      if (!fila || fila.tenantId !== tenantId) return null;
      const antes = configDeLaConexion(fila.config);
      const resto = fila.config && typeof fila.config === "object" && !Array.isArray(fila.config) ? (fila.config as Record<string, unknown>) : {};
      await tx.integracionConexion.updateMany({
        where: { tenantId, id: fila.id },
        data: { config: { ...resto, facturacion: { ...v.config } } as object },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: `user:${userId}`,
          action: "facturita.mercadopago_facturacion_config",
          entity: "IntegracionConexion",
          entityId: fila.id,
          changes: { antes: { ...antes }, despues: { ...v.config } } as object,
          channel: "admin",
        },
      });
      return v.config;
    },
    { tenantId },
  );
  return r ? { ok: true, config: r } : { ok: false, motivo: "sin_conexion" };
}

async function auditar(tenantId: string, userId: string, action: string, changes: Record<string, string | number>): Promise<void> {
  try {
    await tenantTransaction(
      (tx) =>
        tx.auditLog.create({
          data: { tenantId, actor: `user:${userId}`, action, entity: "IntegracionConexion", entityId: CONECTOR_MP, changes, channel: "admin" },
        }),
      { tenantId },
    );
  } catch (e) {
    logger.error("facturita", "no se pudo auditar Mercado Pago", e, { tenantId, action });
  }
}
