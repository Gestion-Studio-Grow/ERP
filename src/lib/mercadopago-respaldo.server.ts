// ============================================================================
// Mercado Pago · sincronización de RESPALDO (por si un aviso no llegó). PR2.
// ============================================================================
//
// El camino principal son los avisos (webhook por conexión). Esto recorre los negocios con la
// facturación de MP PRENDIDA, lee en la API de MP los pagos de las últimas 48 h con el token de SU
// conexión y los pasa, uno por uno, a `procesar`. Lo llama la ruta /api/cron/mp-respaldo, protegida
// con CRON_SECRET, desde un programador externo: en Vercel Hobby un cron de menos de un día rompe el
// deploy (lección PD-3), así que NO va en vercel.json.
//
// HOY CORRE EN SECO: `procesar` por defecto sólo CLASIFICA y cuenta (no guarda ni factura nada).
// Cuando la sesión A congele el contrato de estados, `procesar` pasa a crear la propuesta con su
// idempotencia por (negocio, pago): el respaldo y el aviso del mismo pago terminan en UNA sola.
//
// Un negocio que falla no frena a los demás; nunca se loguea un token.

import { idsDeLosNegocios } from "@/lib/cron/negocios";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { conexionDelNegocio, leerCredencial } from "@/integraciones/conexiones.server";
import { CAMPO_TOKEN_MP } from "@/plugins/mercadopago/conector";
import { HttpMercadoPagoClient, tokenFijo, type PagoMP } from "@/plugins/mercadopago";
import type { CriterioBusqueda, PaginaPagos } from "@/plugins/pagos";
import { UMBRAL_IDENTIFICACION_DEFAULT } from "@/plugins/bancos/domain/reglas";
import { CONECTOR_MP, configFacturacionMPDelNegocio, renovarMPSiHaceFalta } from "@/lib/facturita-mp.server";
import { clasificarPagoMP, type ConfigFacturacionMP, type DecisionPagoMP } from "@/lib/mercadopago-clasificacion";

/** Lo que el respaldo necesita del negocio para clasificar. */
export interface NegocioParaClasificar {
  cuit: string | null;
  umbralIdentificacion: number;
}

export interface DepsRespaldoMP {
  negocios(): Promise<string[]>;
  config(tenantId: string): Promise<ConfigFacturacionMP>;
  /** El cliente de la API de MP con el token de la conexión del negocio, o null si no hay conexión. */
  cliente(tenantId: string): Promise<{ listPayments(c: CriterioBusqueda): Promise<PaginaPagos> } | null>;
  negocio(tenantId: string): Promise<NegocioParaClasificar>;
  procesar(tenantId: string, pago: PagoMP, decision: DecisionPagoMP): Promise<void>;
  ahora(): Date;
}

export interface ResumenRespaldoMP {
  negocios: number;
  apagados: number;
  sinConexion: number;
  conError: number;
  pagosLeidos: number;
  porDecision: Partial<Record<DecisionPagoMP["tipo"], number>>;
}

/** Tope de páginas por negocio y corrida: una cuenta con miles de pagos no cuelga la ruta. */
export const PAGINAS_MAXIMAS = 10;
const VENTANA_MS = 48 * 60 * 60 * 1000;

/** `AAAAMMDD` del día en la Argentina (MP filtra por fecha; un día de más no duplica: es idempotente). */
function diaArgentino(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .replace(/-/g, "");
}

export async function sincronizarRespaldoMP(deps: DepsRespaldoMP): Promise<ResumenRespaldoMP> {
  const r: ResumenRespaldoMP = { negocios: 0, apagados: 0, sinConexion: 0, conError: 0, pagosLeidos: 0, porDecision: {} };
  const ahora = deps.ahora();
  const criterio: CriterioBusqueda = { desde: diaArgentino(new Date(ahora.getTime() - VENTANA_MS)), hasta: diaArgentino(ahora) };
  for (const tenantId of await deps.negocios()) {
    r.negocios++;
    try {
      const config = await deps.config(tenantId);
      if (config.modo === "apagado") {
        r.apagados++;
        continue;
      }
      const cliente = await deps.cliente(tenantId);
      if (!cliente) {
        r.sinConexion++;
        continue;
      }
      const negocio = await deps.negocio(tenantId);
      let cursor: string | undefined;
      let paginas = 0;
      do {
        const pagina = await cliente.listPayments({ ...criterio, cursor });
        for (const pago of pagina.pagos) {
          r.pagosLeidos++;
          const decision = clasificarPagoMP(pago as PagoMP, {
            config,
            cuitNegocio: negocio.cuit,
            umbralIdentificacion: negocio.umbralIdentificacion,
            // El enlace con lo ya facturado lo resuelve `procesar` con el contrato (necesita la base).
            facturaDeLaReferencia: null,
          });
          r.porDecision[decision.tipo] = (r.porDecision[decision.tipo] ?? 0) + 1;
          await deps.procesar(tenantId, pago as PagoMP, decision);
        }
        cursor = pagina.nextCursor;
      } while (cursor && ++paginas < PAGINAS_MAXIMAS);
    } catch (e) {
      r.conError++;
      logger.error("mercadopago.respaldo", "falló el respaldo de un negocio", e, { tenantId });
    }
  }
  return r;
}

/** Las dependencias reales. `procesar` en seco hasta el contrato de estados (ver cabecera). */
export const DEPS_RESPALDO_MP: DepsRespaldoMP = {
  negocios: idsDeLosNegocios,
  config: configFacturacionMPDelNegocio,
  async cliente(tenantId) {
    await renovarMPSiHaceFalta(tenantId);
    const cx = await conexionDelNegocio(tenantId, CONECTOR_MP);
    if (!cx) return null;
    const token = await leerCredencial(tenantId, cx.conexionId, CAMPO_TOKEN_MP);
    return token ? new HttpMercadoPagoClient(tokenFijo({ accessToken: token })) : null;
  },
  async negocio(tenantId) {
    const t = await tenantTransaction(
      (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { arcaCuit: true, bancosUmbralIdentificacion: true } }),
      { tenantId },
    );
    const umbral = t?.bancosUmbralIdentificacion != null ? Number(t.bancosUmbralIdentificacion) : UMBRAL_IDENTIFICACION_DEFAULT;
    return { cuit: t?.arcaCuit ?? null, umbralIdentificacion: umbral > 0 ? umbral : UMBRAL_IDENTIFICACION_DEFAULT };
  },
  async procesar() {
    // EN SECO: sin contrato de estados no se guarda ni se factura nada.
  },
  ahora: () => new Date(),
};
