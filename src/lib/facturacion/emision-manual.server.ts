import "server-only";

// ============================================================================
// EMISIÓN MANUAL — el motor de UNA factura cargada a mano, compartido por todas las pantallas
// ============================================================================
//
// Lo usan el panel de cualquier negocio (Facturación → Emitir), la consola del contador (por cada
// cliente de la cartera) y Factoque. Cada pantalla pone SU barrera (capability, blueprint,
// pertenencia a la cartera) y le pasa al motor el negocio que emite; el motor no decide quién puede.
//
// Es el cuerpo que antes vivía dentro de `emitirFacturitaAction`, sin cambios de criterio: valida
// con `validarEmision`, crea la factura por el motor del Core (`createInvoiceInTx`, la letra la
// decide `decidirComprobante`), guarda el comprador para el PDF y el registro de la emisión en la
// MISMA transacción (guarda del doble toque por clave), despacha a ARCA y contesta el estado REAL.
//
// Lo único que cambia según el negocio es el tope mensual: es del PLAN de Factoque (blueprint
// `facturita`; Gratis 5, Plus 40, Pro 159 según `Tenant.plan` y su vigencia, plan-factoque.server.ts),
// no de quien emite. Un negocio de otro blueprint no tiene tope.

import { revalidatePath } from "next/cache";
import { tenantTransaction } from "@/lib/rls";
import { createInvoiceInTx } from "@/lib/invoice-core";
import { getFiscalProfile, isInvoicingEnabled, PerfilFiscalIncompletoError } from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { contarFacturasDelMes, fechaFiscalDelDia, filtrosFacturacionMes } from "@/lib/bancos-glue";
import { logger } from "@/lib/logger";
import { letraDelTipo } from "@/lib/factura-de-prueba";
import { leerRegimenFacturaA } from "@/lib/fiscal/regimen-factura-a.server";
import type { RegimenFacturaA } from "@/lib/fiscal/decidir-comprobante";
import { modoDesdeEnv } from "@/plugins/arca";
import { ACCION_RECEPTOR_DEL_COMPROBANTE, ENTIDAD_RECEPTOR_DEL_COMPROBANTE } from "@/lib/comprobante-pdf-datos";
import {
  esDePrueba,
  estadoLimite,
  mensajeDeEmision,
  numeroDeComprobante,
  origenDelRechazo,
  validarEmision,
  ventanaDeFechaArca,
  type EmisionFacturita,
  type EstadoEmision,
} from "@/lib/facturita-core";
import { montosFacturita } from "@/lib/facturita-montos";
import { ACCION_EMISION, ENTIDAD_EMISION, claveEmisionValida, type RegistroEmision } from "@/lib/facturita-atajos";
import type { ResultadoEmisionManual } from "@/lib/facturacion/facturador-core";
import { BLUEPRINT_CON_TOPE, leerPlanFactoque, planFactoqueEnTx } from "@/lib/facturacion/plan-factoque.server";

export type { ResultadoEmisionManual };

export interface ContextoEmisionManual {
  /** El negocio que EMITE (el de la sesión, o el cliente de la cartera del contador). */
  tenantId: string;
  /** Quién lo pidió, para el registro (`user:<id>`). */
  actor: string;
  /** Las rutas a refrescar después de emitir. */
  revalidar: readonly string[];
}

/** El tope del plan se agotó mientras esperaba su turno: no se crea la factura. */
class TopeDelPlanError extends Error {}

/** P2021/P2022: el código llegó antes que su migración (Gate 2). */
export function esMigracionPendiente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
}

/** `AuditLog.entityId` del registro: la clave del pedido, o la factura si el pedido no trajo clave. */
function idDelRegistro(clave: string | null, invoiceId: string): string {
  return clave ? `clave:${clave}` : `factura:${invoiceId}`;
}

function invoiceIdDelRegistro(changes: unknown): string | null {
  const id = (changes as { invoiceId?: unknown } | null)?.invoiceId;
  return typeof id === "string" && id ? id : null;
}

/** La factura que ya emitió esta clave en este negocio, si la hay. */
async function facturaDeLaClave(tenantId: string, clave: string): Promise<string | null> {
  const r = await tenantTransaction(
    (tx) =>
      tx.auditLog.findFirst({
        where: { tenantId, entity: ENTIDAD_EMISION, entityId: idDelRegistro(clave, "") },
        select: { changes: true },
      }),
    { tenantId },
  );
  return invoiceIdDelRegistro(r?.changes);
}

/**
 * Emite UNA factura manual en el negocio `ctx.tenantId`. La barrera de acceso es de quien llama.
 * Devuelve el estado REAL de la factura: autorizada (con CAE, o de prueba), pendiente o rechazada
 * (por ARCA o frenada por el sistema), nunca un «emitida» genérico.
 */
export async function emitirComprobanteManual(
  ctx: ContextoEmisionManual,
  datos: EmisionFacturita,
): Promise<ResultadoEmisionManual> {
  const r = await emitir(ctx, datos);
  // Los textos de `mensajeDeEmision` nombran la lista de Factoque; en las otras pantallas, la propia.
  if (!r.ok || r.limite) return r;
  return {
    ...r,
    mensaje: r.mensaje.replace("«Mis facturas»", "la lista de comprobantes").replace("«Mi cuenta» → «Conectar con ARCA»", "Facturación → «Conectar con ARCA»"),
  };
}

async function emitir(ctx: ContextoEmisionManual, datos: EmisionFacturita): Promise<ResultadoEmisionManual> {
  const { tenantId, actor } = ctx;
  // La fecha del comprobante es el día del NEGOCIO, no el del proceso (ver bancos-glue).
  const hoy = fechaFiscalDelDia(new Date());

  const negocio = await tenantTransaction(
    (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true, arcaHomologacion: true } }),
    { tenantId },
  );
  const homologacion = negocio?.arcaHomologacion ?? true;
  const conTope = negocio?.blueprintId === BLUEPRINT_CON_TOPE;

  // La condición del emisor decide qué exige el comprador (la A lleva su domicilio). Sin perfil
  // cargado, `null`: la emisión lo frena más abajo con su mensaje.
  const condicionEmisor = await getFiscalProfile(tenantId)
    .then((p) => p.condicionIva)
    .catch((e: unknown) => {
      if (e instanceof PerfilFiscalIncompletoError) return null;
      throw e;
    });
  const validacion = validarEmision(datos, hoy, { condicionEmisor });
  if (!validacion.ok) return { ok: false, error: validacion.error };
  // Una clave que no tiene la forma no se ignora: sin ella se perdería la guarda del doble toque.
  if (datos.claveEmision !== undefined && !claveEmisionValida(datos.claveEmision)) {
    return { ok: false, error: "No se pudo emitir: recargá la pantalla y probá de nuevo." };
  }
  const clave = datos.claveEmision ?? null;

  // El mismo pedido otra vez (doble toque, reintento): la factura ya existe, no se cuenta de nuevo
  // contra el tope ni se pide otro CAE. Se contesta con cómo quedó la primera.
  const yaEmitida = clave ? await facturaDeLaClave(tenantId, clave) : null;
  // El cupo del plan que rige hoy (vencido → Gratis). Se vuelve a leer DENTRO de la transacción, con
  // el candado: esta lectura sólo frena temprano y arma la respuesta.
  const planHoy = conTope ? await leerPlanFactoque(tenantId, hoy) : null;
  const cupoHoy = planHoy?.cupo;
  const limite = conTope ? estadoLimite(await contarFacturasDelMes(tenantId), cupoHoy) : null;
  if (!yaEmitida && limite && !limite.puedeEmitir) {
    return { ok: false, error: limite.mensaje ?? "Llegaste al límite de facturas del plan de este mes." };
  }

  try {
    const perfil = await getFiscalProfile(tenantId);
    // Inscripto: IVA declarado en el renglón con la alícuota elegida (ivaPorProducto). C: sin IVA.
    const montos = montosFacturita(perfil.condicionIva, datos.total, validacion.alicuotaId);
    if (!montos.ok) return { ok: false, error: montos.error };

    // `descripcion` necesita la migración 20261022140000 (Gate 2). En una base sin ella (P2022) la
    // factura se crea igual, sin la descripción (el PDF cae al concepto), en vez de no emitir.
    const crear = (conDescripcion: boolean) =>
      tenantTransaction(
        async (tx) => {
          if (clave) {
            // Dos pedidos con la misma clave se ponen en fila: el segundo espera a que el primero
            // confirme y encuentra su registro. Nunca dos facturas (ni dos CAE) por un doble toque.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`facturita-emision:${tenantId}:${clave}`}))`;
            const previa = await tx.auditLog.findFirst({
              where: { tenantId, entity: ENTIDAD_EMISION, entityId: idDelRegistro(clave, "") },
              select: { changes: true },
            });
            const previaId = invoiceIdDelRegistro(previa?.changes);
            if (previaId) return previaId;
          }
          if (conTope) {
            // El tope, contado DENTRO de la fila del negocio: dos pedidos simultáneos con claves
            // distintas no pasan los dos con el último lugar (certificación del facturador guiado).
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`facturita-cupo:${tenantId}`}))`;
            // El plan, releído con el candado tomado: un cambio de plan del operador o una
            // vigencia que vence en el medio se respetan; si dejó de ser Factoque, sin tope.
            const plan = await planFactoqueEnTx(tx, tenantId, hoy);
            if (plan) {
              const usadas = await tx.invoice.count({ where: { tenantId, ...filtrosFacturacionMes().cupo } });
              const cupo = estadoLimite(usadas, plan.cupo);
              if (!cupo.puedeEmitir) throw new TopeDelPlanError(cupo.mensaje ?? "Llegaste al límite de facturas del plan de este mes.");
            }
          }
          const id = await createInvoiceInTx(tx, {
            tenantId,
            concepto: validacion.concepto,
            fecha: hoy,
            emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta },
            // RG 5616: la condición REAL del comprador (con CUIT la eligió la persona; sin CUIT, consumidor final).
            receptor: validacion.receptor,
            neto: montos.neto,
            iva: montos.iva,
            total: montos.total,
            ...(montos.ivaPorProducto ? { ivaPorProducto: true } : {}),
            ...(validacion.servicio
              ? {
                  servicioDesde: validacion.servicio.desde,
                  servicioHasta: validacion.servicio.hasta,
                  vencimientoPago: validacion.servicio.vencimientoPago,
                }
              : {}),
            // Lo que se vendió, para el PDF y la lista (no viaja a ARCA). Migración 20261022140000 (Gate 2).
            ...(conDescripcion ? { descripcion: validacion.descripcion } : {}),
          });
          if (validacion.ficha) {
            await tx.auditLog.create({
              data: {
                tenantId,
                actor,
                action: ACCION_RECEPTOR_DEL_COMPROBANTE,
                entity: ENTIDAD_RECEPTOR_DEL_COMPROBANTE,
                entityId: id,
                changes: {
                  nombre: validacion.ficha.nombre,
                  domicilio: validacion.ficha.domicilio,
                  condicionIva: validacion.receptor.condicionIva,
                },
                channel: "admin",
              },
            });
          }
          // El registro de la emisión, en la MISMA transacción que la factura: guarda del doble toque
          // (por su clave) y fuente de «Repetir la última».
          const registro: RegistroEmision = {
            invoiceId: id,
            descripcion: validacion.descripcion,
            total: montos.total,
            concepto: datos.concepto ?? "productos",
            consumidorFinal: validacion.receptor.condicionIva === "CONSUMIDOR_FINAL" && !validacion.ficha,
          };
          await tx.auditLog.create({
            data: {
              tenantId,
              actor,
              action: ACCION_EMISION,
              entity: ENTIDAD_EMISION,
              entityId: idDelRegistro(clave, id),
              changes: { ...registro },
              channel: "admin",
            },
          });
          return id;
        },
        { tenantId },
      );
    const invoiceId =
      yaEmitida ??
      (await crear(true).catch((e: unknown) => {
        if (esMigracionPendiente(e)) return crear(false);
        throw e;
      }));
    const repetida = yaEmitida !== null;

    // Despacho a ARCA (CAE) si la facturación está encendida (stub/homologación/real).
    const encendida = isInvoicingEnabled();
    if (encendida) {
      await procesarEnviosDelNegocio(tenantId).catch((err) =>
        logger.warn("emision-manual", "despacho ARCA diferido (lo toma el próximo ciclo)", {
          tenantId,
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    }

    // Desde acá la factura YA EXISTE: un error al leer cómo quedó no puede contestarse como «no se
    // emitió», porque la pantalla tiraría la clave y el reintento pediría otro CAE (certificación
    // M1). Se contesta pendiente con su id: el estado real lo muestra la lista.
    const pendiente: EstadoEmision = {
      estado: "pendiente",
      motivo: encendida ? "esperando" : "apagada",
      ventanaDias: ventanaDeFechaArca(validacion.concepto),
    };
    try {
      for (const ruta of ctx.revalidar) revalidatePath(ruta);

      // Cómo quedó de verdad: se lee la factura después del despacho.
      const f = await tenantTransaction(
        (tx) =>
          tx.invoice.findFirst({
            where: { id: invoiceId, tenantId },
            select: { status: true, rechazoMotivo: true, cae: true, numero: true, puntoVenta: true, tipoComprobante: true },
          }),
        { tenantId },
      );
      const estado: EstadoEmision =
        f?.status === "AUTHORIZED"
          ? {
              estado: "autorizada",
              dePrueba: esDePrueba(modoDesdeEnv(), homologacion),
              numero: numeroDeComprobante(f.puntoVenta, f.numero),
              cae: f.cae,
              letra: letraDelTipo(f.tipoComprobante),
            }
          : f?.status === "REJECTED"
            ? { estado: "rechazada", origen: origenDelRechazo(f.rechazoMotivo), motivo: f.rechazoMotivo ?? "" }
            : pendiente;

      if (estado.estado === "rechazada") {
        return { ok: false, error: mensajeDeEmision(estado), invoiceId, estado };
      }
      const limiteDespues = conTope ? estadoLimite(await contarFacturasDelMes(tenantId), cupoHoy) : null;
      return { ok: true, invoiceId, limite: limiteDespues, estado, mensaje: mensajeDeEmision(estado), ...(repetida ? { repetida } : {}) };
    } catch (err) {
      logger.error("emision-manual", "factura creada; falló leer su estado", err, { tenantId, invoiceId });
      return {
        ok: true,
        invoiceId,
        limite: limite ? estadoLimite(limite.usadas + (repetida ? 0 : 1), cupoHoy) : null,
        estado: pendiente,
        mensaje: mensajeDeEmision(pendiente),
        ...(repetida ? { repetida } : {}),
      };
    }
  } catch (err) {
    if (err instanceof TopeDelPlanError) return { ok: false, error: err.message };
    logger.error("emision-manual", "emisión falló", err, { tenantId });
    // Perfil fiscal sin cargar: reintentar no lo arregla, hay que cargar el dato.
    if (err instanceof PerfilFiscalIncompletoError) {
      return {
        ok: false,
        error:
          "Faltan los datos fiscales del negocio (CUIT y punto de venta). " +
          "Cargá el alta fiscal antes de emitir: no se emite con datos provisorios.",
      };
    }
    return { ok: false, error: "No se pudo emitir la factura. Probá de nuevo en unos minutos." };
  }
}

/**
 * Lo que la pantalla de emitir necesita del EMISOR: su condición frente al IVA (decide la letra y
 * si se pide la alícuota) y la fecha fiscal de hoy. Sin perfil fiscal, `condicionEmisor: null`: el
 * facturador lo dice con la salida a los datos fiscales.
 */
export async function datosDelFacturador(
  tenantId: string,
): Promise<{ condicionEmisor: string | null; hoy: string; regimenFacturaA: RegimenFacturaA | null }> {
  const condicionEmisor = await getFiscalProfile(tenantId)
    .then((p) => p.condicionIva as string)
    .catch((e: unknown) => {
      if (e instanceof PerfilFiscalIncompletoError) return null;
      throw e;
    });
  // Sólo el inscripto emite A: sin la clase cargada, ARCA rechaza la A (decidir-comprobante.ts,
  // REGIMEN_A_A_CONFIRMAR). La pantalla lo avisa ANTES de emitir.
  const regimenFacturaA = condicionEmisor === "RESPONSABLE_INSCRIPTO" ? await leerRegimenFacturaA(tenantId) : null;
  return { condicionEmisor, hoy: fechaFiscalDelDia(new Date()), regimenFacturaA };
}

/**
 * ¿El negocio tiene la facturación electrónica ASIGNADA (módulo `arca` en su lista)? Es la regla de
 * la factura de prueba (facturacion-actions.ts): explícita, no la del interruptor de módulos, que
 * con el flag apagado da todo por activo y le abriría «Emitir» a un negocio sin ARCA.
 */
export async function tieneFacturacionElectronica(tenantId: string): Promise<boolean> {
  const t = await tenantTransaction((tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { modules: true } }), { tenantId });
  return (t?.modules ?? []).includes("arca");
}
