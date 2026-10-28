// ============================================================================
// CARTERA · ABONOS Y LOTE DEL MES — guardado, lectura y emisión (SERVIDOR).
// ============================================================================
//
// La lógica vive en `src/app/contador/abonos/abonos-core.ts` (pura, con tests). Acá se cablea al
// motor (contrato: src/lib/facturacion/README.md):
//
// DÓNDE SE GUARDAN LAS REGLAS: la tabla `ReglaFacturacion` del motor, con `tenantId` = el ESTUDIO
// (RLS) y llave foránea a `CarteraCliente`: la base impide una regla sobre un negocio que no está
// en la cartera. Un cambio actualiza la fila; una baja la pasa a `estado = baja` (las facturas la
// siguen nombrando por su clave).
//
// CÓMO NO SE EMITE DOS VECES: el origen `ABONO` del motor, con `claveDeAbono(regla, mes)` y el
// índice único `Invoice(tenantId, abonoClave)`. `createInvoiceInTx` devuelve la factura existente
// y, con `reabrirSiRechazada`, vuelve a emitir la rechazada (misma fila, envío nuevo). Dos lotes a
// la vez: uno crea y el otro choca con el índice (P2002) y lo cuenta como ya emitido.
//
// GATE 2: la tabla y las columnas son de las migraciones `20261022140000_invoice_abono_descripcion`
// y `20261022140100_regla_facturacion`, SIN aplicar en Neon. Hasta que el dueño las aplique, toda
// lectura choca con P2021/P2022 y la consola lo dice (`MigracionPendienteError`), sin un 500.
//
// AISLAMIENTO (ADR-077 §4): todo dato de un cliente se lee y se escribe con
// `tenantTransaction({ tenantId: cliente })`, y los clientes salen SIEMPRE de la cartera del
// estudio de la sesión (`filasDeCarteraDb`). Jamás operatorPrisma.
//
// Sin "use server": las funciones reciben tenantIds; las llaman las actions de
// `cartera-abonos-actions.ts` después de `exigirEstudio()`.

import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { claveDeAbono, createInvoiceInTx } from "@/lib/invoice-core";
import { getFiscalProfile, isInvoicingEnabled, PerfilFiscalIncompletoError } from "@/lib/fiscal";
import { contarPendientesDelNegocio, procesarEnviosDelNegocio, type DepsDespacho } from "@/lib/arca-dispatch";
import { capFacturasMesDelNegocioEnTx } from "@/lib/limites-del-negocio-en-tx";
import { filtrosFacturacionMes } from "@/lib/bancos-glue";
import { bordesDelMes, fechaFiscalDelDia, type MesKey } from "@/lib/libros/fecha-fiscal";
import { logger } from "@/lib/logger";
import { buscarFilaCartera, filasDeCarteraDb, metadataClientesDb } from "@/lib/cartera-gate";
import {
  armarComprobante,
  filaDesdeRegla,
  prepararLote,
  reglaDesdeFila,
  type ClienteDelLote,
  type DatosRegla,
  type EmisionPrevia,
  type EmisorAbono,
  type ReglaAbono,
  type RenglonLote,
} from "@/app/contador/abonos/abonos-core";
import { autorizarEnTandas, TANDA_DE_ARCA, type ResultadoDeAutorizar } from "@/lib/facturacion/autorizar-en-tandas";

// ── Gate 2: las migraciones del motor todavía no están en la base ─────────────

export const MIGRACION_PENDIENTE =
  "Los abonos necesitan un último paso de base de datos que todavía no se aplicó (lo hace el dueño). Cuando se aplique, esta pantalla se enciende sola.";

export class MigracionPendienteError extends Error {
  constructor() {
    super(MIGRACION_PENDIENTE);
    this.name = "MigracionPendienteError";
  }
}

/** P2021 (tabla inexistente) / P2022 (columna inexistente): el código llegó antes que su migración. */
export function esMigracionPendiente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
}

async function conMigracion<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (esMigracionPendiente(e)) throw new MigracionPendienteError();
    throw e;
  }
}

// ── Reglas (`ReglaFacturacion`, tenant del estudio) ───────────────────────────

const aNumero = (v: unknown) => (v instanceof Prisma.Decimal ? v.toNumber() : Number(v));

/** Las reglas activas del estudio, en la forma de la pantalla. */
export async function leerReglasDelEstudio(estudioTenantId: string): Promise<ReglaAbono[]> {
  const filas = await conMigracion(() =>
    tenantTransaction(
      (tx) =>
        tx.reglaFacturacion.findMany({
          where: { tenantId: estudioTenantId, estado: "activa" },
          orderBy: [{ clienteTenantId: "asc" }, { descripcion: "asc" }, { id: "asc" }],
        }),
      { tenantId: estudioTenantId },
    ),
  );
  return filas
    .map((f) => reglaDesdeFila({ ...f, importe: aNumero(f.importe) }))
    .filter((r): r is ReglaAbono => r !== null);
}

/**
 * Alta (sin id) o cambio (con id) de una regla. El cambio sólo toca una regla ACTIVA de ESTE
 * estudio (predicado `tenantId` + RLS); `null` = no había tal regla. La llave foránea a la cartera
 * la pone la base: un cliente que no es de la cartera no entra ni por error.
 */
export async function guardarReglaDelEstudio(estudioTenantId: string, regla: DatosRegla, reglaId: string | null): Promise<string | null> {
  const datos = filaDesdeRegla(regla);
  return conMigracion(() =>
    tenantTransaction(
      async (tx) => {
        if (!reglaId) {
          const creada = await tx.reglaFacturacion.create({ data: { tenantId: estudioTenantId, ...datos }, select: { id: true } });
          return creada.id;
        }
        const cambiada = await tx.reglaFacturacion.updateMany({ where: { tenantId: estudioTenantId, id: reglaId, estado: "activa" }, data: datos });
        return cambiada.count === 1 ? reglaId : null;
      },
      { tenantId: estudioTenantId },
    ),
  );
}

/** Baja de una regla activa del estudio. `false` = no había tal regla. */
export async function darDeBajaReglaDelEstudio(estudioTenantId: string, reglaId: string): Promise<boolean> {
  const r = await conMigracion(() =>
    tenantTransaction(
      (tx) => tx.reglaFacturacion.updateMany({ where: { tenantId: estudioTenantId, id: reglaId, estado: "activa" }, data: { estado: "baja" } }),
      { tenantId: estudioTenantId },
    ),
  );
  return r.count === 1;
}

// ── Lo que hay en cada cliente (facturas DEL CLIENTE) ─────────────────────────

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/** Las facturas que ya salieron de estas reglas en `mes` (origen ABONO), con su estado. */
async function emisionesPreviasEnTx(tx: Tx, clienteTenantId: string, reglaIds: string[], mes: MesKey): Promise<EmisionPrevia[]> {
  if (reglaIds.length === 0) return [];
  const porClave = new Map(reglaIds.map((id) => [claveDeAbono(id, mes), id]));
  const facturas = await tx.invoice.findMany({
    where: { tenantId: clienteTenantId, abonoClave: { in: [...porClave.keys()] } },
    select: { abonoClave: true, status: true },
  });
  return facturas
    .filter((f) => f.abonoClave && porClave.has(f.abonoClave))
    .map((f) => ({ reglaId: porClave.get(f.abonoClave!)!, status: f.status }));
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
 * `tenantTransaction`), las facturas de abono del mes y el estado CAE. Secuencial a propósito
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
    const ids = reglas.filter((r) => r.clienteTenantId === fila.clienteTenantId).map((r) => r.id);
    try {
      const { prev, cae } = await tenantTransaction(
        async (tx) => ({
          prev: await emisionesPreviasEnTx(tx, fila.clienteTenantId, ids, mes),
          cae: await estadoCaeEnTx(tx, fila.clienteTenantId, mes),
        }),
        { tenantId: fila.clienteTenantId },
      );
      previas.push(...prev);
      clientes.push({ ...base, cae });
    } catch (e) {
      if (esMigracionPendiente(e)) throw new MigracionPendienteError();
      logger.error("contador", "no se pudo leer el lote de un cliente", e, { clienteTenantId: fila.clienteTenantId });
      sinLeer.push(fila.alias);
      // Sin saber qué se emitió, las reglas de este cliente se muestran frenadas (nunca «para emitir»).
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

/** Un dato de la regla que el motor no acepta (se le muestra a la contadora tal cual). */
class ErrorDeLaRegla extends Error {}

/**
 * Emite UNA regla en el cliente, en su transacción: si ya hay una factura de (regla, mes) que no
 * fue rechazada, nada; si no, respeta el límite del plan y crea (o reabre la rechazada) con el
 * origen ABONO. La guarda final es el índice único: dos lotes a la vez → P2002 → «ya emitida».
 */
async function emitirUna(
  regla: ReglaAbono,
  mes: MesKey,
  hoy: string,
  ahora: Date,
  capColumna: number | null,
  emisor: EmisorAbono,
): Promise<ResultadoUna> {
  const tenantId = regla.clienteTenantId;
  const clave = claveDeAbono(regla.id, mes);
  const armado = armarComprobante(regla, emisor, mes, hoy);
  if (!armado.ok) throw new ErrorDeLaRegla(armado.error);
  try {
    return await tenantTransaction(
      async (tx): Promise<ResultadoUna> => {
        const existente = await tx.invoice.findFirst({ where: { tenantId, abonoClave: clave }, select: { status: true } });
        if (existente && existente.status !== "REJECTED") return "ya_emitida";
        const cap = await capFacturasMesDelNegocioEnTx(tx, tenantId, capColumna);
        const usadas = await tx.invoice.count({ where: { tenantId, ...filtrosFacturacionMes(ahora).cupo } });
        if (usadas >= cap) return "limite";
        await createInvoiceInTx(tx, { tenantId, ...armado.comprobante, origin: { type: "ABONO", id: clave }, reabrirSiRechazada: true });
        return "emitida";
      },
      { tenantId },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "ya_emitida";
    throw e;
  }
}

/**
 * Emite el lote de `mes`: recalcula el lote (nunca confía en lo que mostró la pantalla), emite lo
 * que corresponde cliente por cliente y, con la facturación encendida, lo manda a ARCA.
 */
export async function emitirLoteDelEstudio(estudioTenantId: string, mes: MesKey, ahora: Date = new Date()): Promise<ResultadoLote> {
  const lote = await prepararLoteDelEstudio(estudioTenantId, mes);
  const hoy = fechaFiscalDelDia(ahora);
  const ids = [...new Set(lote.renglones.map((r) => r.regla.clienteTenantId))];
  const metas = ids.length ? await metadataClientesDb(ids) : new Map();
  const res: ResultadoLote = { emitidas: 0, porLimite: 0, errores: [], arca: null };
  const conEmisiones = new Set<string>();

  const porCliente = new Map<string, RenglonLote[]>();
  for (const r of lote.renglones) {
    if (r.estado !== "para_emitir" && r.estado !== "reemitir") continue;
    porCliente.set(r.regla.clienteTenantId, [...(porCliente.get(r.regla.clienteTenantId) ?? []), r]);
  }

  for (const [clienteTenantId, renglones] of porCliente) {
    let emisor: EmisorAbono;
    try {
      const perfil = await getFiscalProfile(clienteTenantId);
      emisor = { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta };
    } catch (e) {
      if (!(e instanceof PerfilFiscalIncompletoError)) throw e;
      const error = "Le faltan datos fiscales (CUIT, punto de venta o condición frente al IVA): pedíselos a Soporte GSG.";
      for (const r of renglones) res.errores.push({ alias: r.alias, descripcion: r.regla.descripcion, error });
      continue;
    }
    const capColumna = metas.get(clienteTenantId)?.capFacturasMes ?? null;
    for (const r of renglones) {
      // La cartera se relee JUSTO antes de cada emisión: si mientras corría el lote alguien dio de
      // baja (o pausó) al cliente, no se le emite. Va en la transacción del ESTUDIO y no en la del
      // cliente porque CarteraCliente es del estudio (RLS: con el GUC del cliente se leen 0 filas).
      const vigente = await buscarFilaCartera(estudioTenantId, clienteTenantId);
      if (vigente?.estado !== "activa") {
        res.errores.push({
          alias: r.alias,
          descripcion: r.regla.descripcion,
          error: vigente?.estado === "pausada" ? "El cliente se pausó mientras corría el lote: no se emitió." : "El cliente salió de tu cartera mientras corría el lote: no se emitió.",
        });
        continue;
      }
      try {
        const salida = await emitirUna(r.regla, mes, hoy, ahora, capColumna, emisor);
        if (salida === "emitida") {
          res.emitidas++;
          conEmisiones.add(clienteTenantId);
        } else if (salida === "limite") res.porLimite++;
      } catch (e) {
        if (e instanceof ErrorDeLaRegla) {
          res.errores.push({ alias: r.alias, descripcion: r.regla.descripcion, error: e.message });
          continue;
        }
        logger.error("contador", "no se pudo emitir un abono", e, { clienteTenantId, reglaId: r.regla.id, mes });
        res.errores.push({ alias: r.alias, descripcion: r.regla.descripcion, error: "No se pudo crear la factura. Probá de nuevo; si sigue, avisale a Soporte GSG." });
      }
    }
  }

  if (conEmisiones.size > 0 && isInvoicingEnabled()) {
    const arca = { autorizados: 0, rechazados: 0, pendientes: 0 };
    for (const clienteTenantId of conEmisiones) {
      try {
        const r = await mandarPendientesDelCliente(clienteTenantId, OPCIONES_DEL_LOTE);
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

export interface OpcionesDeEnvio {
  /** Toma también los que esperan su próximo intento (sólo cuando lo pide una persona). */
  ignorarEspera: boolean;
  /** Antes de tomar, les da un intento más a los detenidos (sólo cuando lo pide una persona). */
  reactivarDetenidos: boolean;
}

/** «Mandar los pendientes a ARCA»: lo pide la contadora, como «Autorizar ahora» del negocio. */
export const OPCIONES_DE_UNA_PERSONA: OpcionesDeEnvio = { ignorarEspera: true, reactivarDetenidos: true };
/** El envío que sigue a «Emitir el lote»: respeta las esperas y no revive lo detenido. */
export const OPCIONES_DEL_LOTE: OpcionesDeEnvio = { ignorarEspera: false, reactivarDetenidos: false };

/**
 * Manda a ARCA los pendientes del cliente, de a tandas (`autorizarEnTandas`, la misma regla que
 * «Autorizar los pendientes» del negocio). Los detenidos se reactivan una vez, en la primera tanda.
 * `deps` sólo lo cambian los tests (el simulador de ARCA). El llamador ya verificó la cartera.
 */
export async function mandarPendientesDelCliente(
  clienteTenantId: string,
  opciones: OpcionesDeEnvio,
  deps?: DepsDespacho,
): Promise<ResultadoDeAutorizar> {
  const inicial = await contarPendientesDelNegocio(clienteTenantId);
  let primera = true;
  return autorizarEnTandas(async (saltear) => {
    const conErrorDelSistema: string[] = [];
    const r = await procesarEnviosDelNegocio(clienteTenantId, TANDA_DE_ARCA, deps, {
      saltear,
      alFallarPorElSistema: (id) => conErrorDelSistema.push(id),
      ignorarEspera: opciones.ignorarEspera,
      reactivarDetenidos: opciones.reactivarDetenidos && primera,
    });
    primera = false;
    return { ...r, quedan: await contarPendientesDelNegocio(clienteTenantId), conErrorDelSistema };
  }, inicial);
}
