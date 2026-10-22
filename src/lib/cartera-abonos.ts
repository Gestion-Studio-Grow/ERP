// ============================================================================
// CARTERA · ABONOS Y LOTE DEL MES — guardado, lectura y emisión (SERVIDOR).
// ============================================================================
//
// La lógica vive en `src/app/contador/abonos/abonos-core.ts` (pura, con tests). Acá se cablea:
//
// DÓNDE SE GUARDAN LAS REGLAS (sin migración — Gate 2): filas de `AuditLog` del ESTUDIO,
// entidad `ReglaAbono`. Cada guardado es una versión completa (acción `cartera.abono.guardado`) y
// la baja es otra fila (`cartera.abono.baja`): nada se edita ni se borra, y queda quién cambió
// qué y cuándo. Mismo molde que el pedido de alta (cartera-alta-reglas.ts). La tabla propia
// (`ReglaFacturacion`) está pedida al motor: docs/producto/contador/PEDIDOS-AL-MOTOR.md §3.
//
// CÓMO NO SE EMITE DOS VECES: la emisión de (regla, mes) corre en UNA `tenantTransaction` del
// CLIENTE con un candado por (cliente, regla, mes): mira las emisiones anteriores (filas
// `cartera.abono.emitido` de la auditoría DEL CLIENTE, con el id de la factura) y el estado de
// esas facturas, y recién ahí crea la factura (`createInvoiceInTx`, el motor) y anota la emisión.
// Factura y anotación entran juntas o no entra ninguna.
//
// AISLAMIENTO (ADR-077 §4): todo dato de un cliente se lee y se escribe con
// `tenantTransaction({ tenantId: cliente })`, y los clientes salen SIEMPRE de la cartera del
// estudio de la sesión (`filasDeCarteraDb`). Jamás operatorPrisma.
//
// Sin "use server": las funciones reciben tenantIds; las llaman las actions de
// `cartera-abonos-actions.ts` después de `exigirEstudio()`.

import "server-only";
import { randomUUID } from "node:crypto";
import { tenantTransaction } from "@/lib/rls";
import { createInvoiceInTx } from "@/lib/invoice-core";
import { getFiscalProfile, isInvoicingEnabled, PerfilFiscalIncompletoError } from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { capFacturasMesDelNegocioEnTx } from "@/lib/limites-del-negocio-en-tx";
import { filtrosFacturacionMes } from "@/lib/bancos-glue";
import { bordesDelMes, fechaFiscalDelDia, type MesKey } from "@/lib/libros/fecha-fiscal";
import { logger } from "@/lib/logger";
import { filasDeCarteraDb, metadataClientesDb } from "@/lib/cartera-gate";
import {
  armarComprobante,
  claveDeEmision,
  decidirEmision,
  plegarReglas,
  prepararLote,
  type ClienteDelLote,
  type DatosRegla,
  type EmisionPrevia,
  type EventoRegla,
  type ReglaAbono,
  type RenglonLote,
} from "@/app/contador/abonos/abonos-core";
import {
  autorizarEnTandas,
  TANDA_DE_ARCA,
  type ResultadoDeAutorizar,
} from "@/lib/facturacion/autorizar-en-tandas";

export const ENTIDAD_REGLA = "ReglaAbono";
export const ACCION_REGLA_GUARDADA = "cartera.abono.guardado";
export const ACCION_REGLA_BAJA = "cartera.abono.baja";
/** En la auditoría DEL CLIENTE: la factura que salió de (regla, mes). entityId = clave de emisión. */
export const ACCION_ABONO_EMITIDO = "cartera.abono.emitido";

// ── Reglas (auditoría del estudio) ────────────────────────────────────────────

/** Las reglas vigentes del estudio (todas sus versiones y bajas, plegadas). */
export async function leerReglasDelEstudio(estudioTenantId: string): Promise<ReglaAbono[]> {
  const filas = await tenantTransaction(
    (tx) =>
      tx.auditLog.findMany({
        where: {
          tenantId: estudioTenantId,
          entity: ENTIDAD_REGLA,
          action: { in: [ACCION_REGLA_GUARDADA, ACCION_REGLA_BAJA] },
        },
        orderBy: { createdAt: "asc" },
        select: { action: true, entityId: true, changes: true, createdAt: true },
      }),
    { tenantId: estudioTenantId },
  );
  const eventos: EventoRegla[] = filas
    .filter((f) => f.entityId)
    .map((f) => ({
      tipo: f.action === ACCION_REGLA_BAJA ? "baja" : "guardada",
      reglaId: f.entityId!,
      en: f.createdAt.toISOString(),
      datos: f.changes,
    }));
  return plegarReglas(eventos);
}

/** Guarda una versión de la regla (nueva si no trae id). Devuelve el id. */
export async function guardarReglaDelEstudio(
  estudioTenantId: string,
  actor: string,
  regla: DatosRegla,
  reglaId: string | null,
): Promise<string> {
  const id = reglaId ?? randomUUID();
  await tenantTransaction(
    (tx) =>
      tx.auditLog.create({
        data: {
          tenantId: estudioTenantId,
          actor,
          action: ACCION_REGLA_GUARDADA,
          entity: ENTIDAD_REGLA,
          entityId: id,
          channel: "admin",
          changes: { ...regla },
        },
      }),
    { tenantId: estudioTenantId },
  );
  return id;
}

export async function darDeBajaReglaDelEstudio(estudioTenantId: string, actor: string, reglaId: string): Promise<void> {
  await tenantTransaction(
    (tx) =>
      tx.auditLog.create({
        data: {
          tenantId: estudioTenantId,
          actor,
          action: ACCION_REGLA_BAJA,
          entity: ENTIDAD_REGLA,
          entityId: reglaId,
          channel: "admin",
          changes: {},
        },
      }),
    { tenantId: estudioTenantId },
  );
}

// ── Lo que hay en cada cliente (auditoría y facturas DEL CLIENTE) ─────────────

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/** Emisiones anteriores de esas claves, con el estado de su factura. Con el `tx` del cliente. */
async function emisionesPreviasEnTx(tx: Tx, clienteTenantId: string, claves: string[]): Promise<EmisionPrevia[]> {
  if (claves.length === 0) return [];
  const filas = await tx.auditLog.findMany({
    where: { tenantId: clienteTenantId, entity: ENTIDAD_REGLA, action: ACCION_ABONO_EMITIDO, entityId: { in: claves } },
    select: { entityId: true, changes: true },
  });
  const ids = filas
    .map((f) => (f.changes as { invoiceId?: unknown } | null)?.invoiceId)
    .filter((x): x is string => typeof x === "string");
  const facturas = ids.length
    ? await tx.invoice.findMany({ where: { tenantId: clienteTenantId, id: { in: ids } }, select: { id: true, status: true } })
    : [];
  const estado = new Map(facturas.map((f) => [f.id, f.status]));
  return filas.map((f) => {
    const invoiceId = (f.changes as { invoiceId?: unknown } | null)?.invoiceId;
    return {
      clave: f.entityId!,
      status: (typeof invoiceId === "string" && estado.get(invoiceId)) || "DESCONOCIDO",
    };
  });
}

/** El estado ante ARCA de los comprobantes del mes de un cliente (por la fecha del comprobante). */
export interface EstadoCaeDelMes {
  autorizados: number;
  pendientes: number;
  rechazados: number;
}

async function estadoCaeEnTx(tx: Tx, clienteTenantId: string, mes: MesKey): Promise<EstadoCaeDelMes> {
  const grupos = await tx.invoice.groupBy({
    by: ["status"],
    where: { tenantId: clienteTenantId, fecha: bordesDelMes(mes).fiscal },
    _count: { _all: true },
  });
  const n = (s: string) => grupos.find((g) => g.status === s)?._count._all ?? 0;
  return { autorizados: n("AUTHORIZED"), pendientes: n("PENDING"), rechazados: n("REJECTED") };
}

// ── El lote del mes ───────────────────────────────────────────────────────────

export interface ClienteEnElLote extends ClienteDelLote {
  cae: EstadoCaeDelMes | null;
}

export interface LoteDelEstudio {
  mes: MesKey;
  renglones: RenglonLote[];
  clientes: ClienteEnElLote[];
  /** Clientes cuya lectura falló: el lote no los muestra como «sin abonos» callando el error. */
  sinLeer: string[];
}

/**
 * Arma el lote de `mes` para el estudio: sus reglas, su cartera y, POR CLIENTE (con su
 * `tenantTransaction`), las emisiones anteriores y el estado CAE del mes. Secuencial a propósito
 * (cuida el pooler de Neon, igual que `recorrerCartera`).
 */
export async function prepararLoteDelEstudio(estudioTenantId: string, mes: MesKey): Promise<LoteDelEstudio> {
  const [reglas, filas] = await Promise.all([leerReglasDelEstudio(estudioTenantId), filasDeCarteraDb(estudioTenantId)]);
  const metas = filas.length ? await metadataClientesDb(filas.map((f) => f.clienteTenantId)) : new Map();
  const clientes: ClienteEnElLote[] = [];
  const previas: EmisionPrevia[] = [];
  const sinLeer: string[] = [];
  for (const fila of filas) {
    const meta = metas.get(fila.clienteTenantId);
    if (!meta) continue; // fila huérfana
    const base: ClienteDelLote = {
      clienteTenantId: fila.clienteTenantId,
      alias: fila.alias,
      estado: fila.estado,
      condicionIva: meta.arcaCondicionIva ?? null,
      cuit: meta.arcaCuit,
      puntoVenta: meta.arcaPuntoVenta,
    };
    const claves = reglas.filter((r) => r.clienteTenantId === fila.clienteTenantId).map((r) => claveDeEmision(r.id, mes));
    try {
      const { prev, cae } = await tenantTransaction(
        async (tx) => ({
          prev: await emisionesPreviasEnTx(tx, fila.clienteTenantId, claves),
          cae: await estadoCaeEnTx(tx, fila.clienteTenantId, mes),
        }),
        { tenantId: fila.clienteTenantId },
      );
      previas.push(...prev);
      clientes.push({ ...base, cae });
    } catch (e) {
      logger.error("contador", "no se pudo leer el lote de un cliente", e, { clienteTenantId: fila.clienteTenantId });
      sinLeer.push(fila.alias);
      // Sin saber qué se emitió, las reglas de este cliente se muestran bloqueadas (nunca «para emitir»).
      clientes.push({ ...base, sinLeer: true, cae: null });
    }
  }
  const porId = new Map(clientes.map((c) => [c.clienteTenantId, c as ClienteDelLote]));
  return { mes, renglones: prepararLote(reglas, porId, previas, mes), clientes, sinLeer };
}

export interface ResultadoLote {
  emitidas: number;
  /** Por el límite de facturas automáticas del plan del cliente. */
  porLimite: number;
  errores: { alias: string; descripcion: string; error: string }[];
  /** Lo que dijo ARCA, sumado entre clientes (sólo con la facturación encendida). */
  arca: { autorizados: number; rechazados: number; pendientes: number } | null;
}

type ResultadoUna = "emitida" | "ya_emitida" | "limite";

/**
 * Emite UNA regla en el cliente: candado (cliente, regla, mes), mira lo anterior, respeta el
 * límite del plan y crea factura + anotación en la misma transacción.
 */
async function emitirUna(
  regla: ReglaAbono,
  mes: MesKey,
  hoy: string,
  ahora: Date,
  capColumna: number | null,
  emisor: Parameters<typeof armarComprobante>[1],
  estudioTenantId: string,
  actor: string,
): Promise<ResultadoUna> {
  const tenantId = regla.clienteTenantId;
  const clave = claveDeEmision(regla.id, mes);
  return tenantTransaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`abono:${tenantId}:${clave}`}))`;
      const decision = decidirEmision(await emisionesPreviasEnTx(tx, tenantId, [clave]));
      if (decision === "ya_emitida") return "ya_emitida";
      const cap = await capFacturasMesDelNegocioEnTx(tx, tenantId, capColumna);
      const usadas = await tx.invoice.count({ where: { tenantId, ...filtrosFacturacionMes(ahora).cupo } });
      if (usadas >= cap) return "limite";
      const invoiceId = await createInvoiceInTx(tx, { tenantId, ...armarComprobante(regla, emisor, mes, hoy) });
      await tx.auditLog.create({
        data: {
          tenantId,
          actor,
          action: ACCION_ABONO_EMITIDO,
          entity: ENTIDAD_REGLA,
          entityId: clave,
          channel: "admin",
          changes: { invoiceId, reglaId: regla.id, mes, estudioTenantId, descripcion: regla.descripcion, importe: regla.importe },
        },
      });
      return "emitida";
    },
    { tenantId },
  );
}

/**
 * Emite el lote de `mes`: recalcula el lote (nunca confía en lo que mostró la pantalla), emite lo
 * que corresponde cliente por cliente y, con la facturación encendida, lo manda a ARCA.
 */
export async function emitirLoteDelEstudio(
  estudioTenantId: string,
  mes: MesKey,
  actor: string,
  ahora: Date = new Date(),
): Promise<ResultadoLote> {
  const lote = await prepararLoteDelEstudio(estudioTenantId, mes);
  const hoy = fechaFiscalDelDia(ahora);
  const metas = await metadataClientesDb([...new Set(lote.renglones.map((r) => r.regla.clienteTenantId))]);
  const res: ResultadoLote = { emitidas: 0, porLimite: 0, errores: [], arca: null };
  const conEmisiones = new Set<string>();

  const porCliente = new Map<string, RenglonLote[]>();
  for (const r of lote.renglones) {
    if (r.estado !== "para_emitir" && r.estado !== "reemitir") continue;
    porCliente.set(r.regla.clienteTenantId, [...(porCliente.get(r.regla.clienteTenantId) ?? []), r]);
  }

  for (const [clienteTenantId, renglones] of porCliente) {
    let emisor: Parameters<typeof armarComprobante>[1];
    try {
      const perfil = await getFiscalProfile(clienteTenantId);
      if (perfil.condicionIva === "RESPONSABLE_INSCRIPTO") throw new Error("inscripto");
      emisor = { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta };
    } catch (e) {
      const error =
        e instanceof PerfilFiscalIncompletoError
          ? "Le faltan datos fiscales (CUIT, punto de venta o condición frente al IVA): pedíselos a Soporte GSG."
          : "Es responsable inscripto: el sistema todavía no emite sus abonos.";
      for (const r of renglones) res.errores.push({ alias: r.alias, descripcion: r.regla.descripcion, error });
      continue;
    }
    const capColumna = metas.get(clienteTenantId)?.capFacturasMes ?? null;
    for (const r of renglones) {
      try {
        const salida = await emitirUna(r.regla, mes, hoy, ahora, capColumna, emisor, estudioTenantId, actor);
        if (salida === "emitida") {
          res.emitidas++;
          conEmisiones.add(clienteTenantId);
        } else if (salida === "limite") res.porLimite++;
      } catch (e) {
        logger.error("contador", "no se pudo emitir un abono", e, { clienteTenantId, reglaId: r.regla.id, mes });
        res.errores.push({ alias: r.alias, descripcion: r.regla.descripcion, error: "No se pudo crear la factura. Probá de nuevo; si sigue, avisale a Soporte GSG." });
      }
    }
  }

  if (conEmisiones.size > 0 && isInvoicingEnabled()) {
    const arca = { autorizados: 0, rechazados: 0, pendientes: 0 };
    for (const clienteTenantId of conEmisiones) {
      try {
        const r = await mandarPendientesDelCliente(clienteTenantId);
        arca.autorizados += r.autorizados;
        arca.rechazados += r.rechazados;
        arca.pendientes += Math.max(0, r.quedan);
      } catch (e) {
        logger.error("contador", "no se pudieron mandar a ARCA los abonos de un cliente", e, { clienteTenantId });
      }
    }
    res.arca = arca;
  }
  return res;
}

// ── Mandar los pendientes de un cliente a ARCA (el reintento) ─────────────────

async function pendientesDelCliente(clienteTenantId: string): Promise<number> {
  return tenantTransaction((tx) => tx.invoice.count({ where: { tenantId: clienteTenantId, status: "PENDING" } }), {
    tenantId: clienteTenantId,
  });
}

/**
 * Manda a ARCA todos los pendientes del cliente, de a tandas (`autorizarEnTandas`, la misma regla
 * que «Autorizar los pendientes» del negocio). Lo que falla por un error nuestro se saltea en las
 * tandas siguientes del mismo toque. El llamador ya verificó que el cliente es de la cartera.
 */
export async function mandarPendientesDelCliente(clienteTenantId: string): Promise<ResultadoDeAutorizar> {
  const inicial = await pendientesDelCliente(clienteTenantId);
  return autorizarEnTandas(async (saltear) => {
    const conErrorDelSistema: string[] = [];
    const r = await procesarEnviosDelNegocio(clienteTenantId, TANDA_DE_ARCA, undefined, {
      saltear,
      alFallarPorElSistema: (id) => conErrorDelSistema.push(id),
    });
    return { ...r, quedan: await pendientesDelCliente(clienteTenantId), conErrorDelSistema };
  }, inicial);
}
