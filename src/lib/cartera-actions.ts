"use server";

// Server Actions del módulo CARTERA (producto Contador — ADR-025 §12 / ADR-045).
// Cablean el core (`cartera-core.ts`) a Prisma/RLS y al reuso de bancos-glue.
//
// GATE COMPUESTO de todas las actions (y de la página /contador):
//   1. capability `cartera:manage` (RBAC — solo OWNER del tenant actual), y
//   2. módulo `cartera` ASIGNADO al tenant actual (`Tenant.modules`, ADR-055):
//      un OWNER común de un negocio cualquiera NO tiene el panel — la asignación
//      del módulo al tenant "estudio contable" es deliberada (consola de operador).
//
// AISLAMIENTO (ADR-018): la cartera se lee con el tenant del ESTUDIO (RLS cubre
// CarteraCliente vía su columna tenantId); los datos de cada cliente se leen SOLO
// con tenantId EXPLÍCITO (tenantTransaction / runInTenantContext) —la pasada del
// monitoreo, `recolectarCliente`, y los cores de bancos-glue— y SIEMPRE tras verificar
// la pertenencia a la cartera. Jamás operatorPrisma en este camino. La única lectura con
// `basePrisma` es la tabla Tenant (fuera de RLS por diseño — raíz del aislamiento) para
// metadata de clientes ya verificados.
//
// Cada export de este archivo es un endpoint (ver la cabecera de cartera-core.ts). Las
// actions que reciben un `clienteTenantId` corren exigirEstudio + exigirClienteDeCartera
// antes de tocar nada; las funciones que leen con un tenantId sin verificarlo no se
// exportan (viven en cartera-core, sin "use server", o acá sin `export`).
//
// ESTADO DE LA MIGRACIÓN `20260711140000_add_cartera_cliente`: NO MEDIDO contra Neon.
//
// Acá decía "NO está aplicada a Neon" como hecho. No lo es: es una afirmación de julio que
// nadie volvió a verificar, y la documentación se contradice a sí misma sobre el tema
// (`docs/producto/HANDOFF-suite-facturacion.md` la da por pendiente; el runbook de ARCA la
// da por aplicada). Los tres enunciados entraron en el MISMO commit, así que no son fuentes
// independientes: es una sola afirmación citada tres veces.
//
// LO QUE SÍ ESTÁ MEDIDO (base local `erp_scope`, rol `app_rls` NOBYPASSRLS, 2026-09-16):
// `CarteraCliente` tiene `relrowsecurity = t` y su policy `tenant_isolation`, por el
// `tenantId` del ESTUDIO. Con el GUC del tenant CLIENTE se leen 0 filas, y sin GUC también
// 0. No hay lectura cruzada.
//
// OJO CON UNA COSA: el SQL de esta migración NO prende RLS. La prende
// `prisma/rls/0001_enable_rls.sql`, que es data-driven y se corre A MANO. O sea que si en
// Neon ese script se corrió ANTES de que existiera esta tabla, la tabla está sin RLS allá
// aunque acá la tenga. Es exactamente el tipo de cosa que no se puede deducir.
//
// LO CIERRAN DOS COMANDOS, con rol directo contra Neon:
//   npx prisma migrate status
//   SELECT relrowsecurity FROM pg_class WHERE relname = 'CarteraCliente';
// Hasta que se corran, nadie puede afirmar ninguna de las dos cosas — ni que sí ni que no.

import { revalidatePath } from "next/cache";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
// `audit()` nunca lanza: auditar no puede voltear la operación. (El pedido de alta NO pasa por acá:
// si no se guarda, el estudio tiene que saberlo, así que se escribe con su propia transacción.)
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentUser } from "@/lib/session";
import { getCurrentTenantId } from "@/lib/tenant";
import {
  ACCION_SOLICITUD_ALTA,
  ACCIONES_QUE_CIERRAN_LA_SOLICITUD,
  hayPedidoAbierto,
  ENTIDAD_SOLICITUD,
  ERROR_AL_GUARDAR_SOLICITUD,
  RESPUESTA_SOLICITUD_ALTA,
  validarSolicitudAlta,
  type SolicitudAltaInput,
} from "@/lib/cartera-alta-reglas";
import {
  emitirPropuestas,
  filtrosFacturacionMes,
  type ResultadoEmision,
} from "@/lib/bancos-glue";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { businessWallTimeToUtc, dateStrInBusinessTz } from "@/lib/datetime";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { modoDesdeEnv } from "@/plugins/arca";
import {
  evaluarCartera,
  type AvisoPlataforma,
  type ContextoPlataforma,
  type FilaMonitor,
  type ResumenMonitor,
} from "@/lib/monitor-core";
import { decidirAcceso } from "@/lib/multilocal/multilocal-core";
import {
  exigirClienteDeCartera,
  recolectarCliente,
  recorrerCartera,
  type ContextoRecoleccion,
  type EstadoCartera,
  type FilaCartera,
  type FilaCarteraDb,
  type MetaCliente,
  type RecorridoPorts,
  type ResumenCartera,
} from "@/lib/cartera-core";

const CONTADOR_PATH = "/contador";

// ── Tipos de retorno (los consume la UI de /contador) ────────────────────────
// FilaCartera/ResumenCartera/EstadoCartera NO se re-exportan desde acá (Turbopack
// registra los re-exports de un módulo "use server" como actions): la UI los
// importa de "@/lib/cartera-core" con `import type`.

/** Volumen (tabla + KPIs) y monitoreo (bandeja) de la cartera, salidos de la MISMA pasada. */
export type ResultadoMonitorCartera =
  | {
      ok: true;
      filas: FilaCartera[];
      resumen: ResumenCartera;
      monitor: { filas: FilaMonitor[]; resumen: ResumenMonitor; avisos: AvisoPlataforma[] };
    }
  | { ok: false; error: string; migracionPendiente?: boolean };

export type ResultadoSimpleCartera = { ok: true } | { ok: false; error: string };

export type ResultadoEmisionCliente =
  | { ok: true; resultado: ResultadoEmision }
  | { ok: false; error: string };

// ── Gate compuesto (capability + módulo asignado) ─────────────────────────────

type Gate = { ok: true; estudioTenantId: string } | { ok: false; error: string };

async function exigirEstudio(): Promise<Gate> {
  // requireCapability redirige si no hay sesión / rol sin la capability.
  await requireCapability("cartera:manage");
  const estudioTenantId = await getCurrentTenantId();
  // Chequeo DURO sobre la asignación (Tenant.modules), independiente del flag del
  // registry: sin el módulo `cartera` asignado, el panel no existe para ese tenant. Y con
  // `multilocal` al lado tampoco: la casa de una red guarda sus locales en la misma tabla, y
  // el panel del contador los trataría como clientes (y podría emitir facturas por ellos).
  // La regla es la misma que usa Mis locales al revés (`decidirAcceso`, multilocal-core.ts).
  const tenant = await basePrisma.tenant.findUnique({
    where: { id: estudioTenantId },
    select: { modules: true },
  });
  const acceso = decidirAcceso(tenant?.modules ?? null, "estudio");
  if (!acceso.ok) return acceso;
  return { ok: true, estudioTenantId };
}

// ── Puertos reales del core ───────────────────────────────────────────────────

/** Filas de la cartera del estudio (tenant del ESTUDIO: RLS + predicado explícito). */
async function filasDeCarteraDb(estudioTenantId: string): Promise<FilaCarteraDb[]> {
  const filas = await tenantTransaction(
    (tx) =>
      tx.carteraCliente.findMany({
        where: { tenantId: estudioTenantId, estado: { not: "baja" } },
        orderBy: { alias: "asc" },
        select: { id: true, clienteTenantId: true, alias: true, estado: true },
      }),
    { tenantId: estudioTenantId },
  );
  return filas.map((f) => ({ ...f, estado: f.estado as EstadoCartera }));
}

/** Busca UNA fila de la cartera (la guarda de pertenencia). */
async function buscarFilaCartera(
  estudioTenantId: string,
  clienteTenantId: string,
): Promise<FilaCarteraDb | null> {
  const fila = await tenantTransaction(
    (tx) =>
      tx.carteraCliente.findUnique({
        where: { tenantId_clienteTenantId: { tenantId: estudioTenantId, clienteTenantId } },
        select: { id: true, clienteTenantId: true, alias: true, estado: true },
      }),
    { tenantId: estudioTenantId },
  );
  return fila ? { ...fila, estado: fila.estado as EstadoCartera } : null;
}

/**
 * Metadata de los clientes de la cartera en UNA lectura (antes: una por cliente).
 *
 * Tenant está fuera de RLS por diseño (raíz del aislamiento). Los ids llegan SOLO desde
 * `recorrerCartera`, que los toma de `filasDeCarteraDb(estudio)`: nunca de un input. Y se
 * selecciona sólo metadata de control, ningún dato de negocio del cliente.
 */
async function metadataClientesDb(ids: string[]): Promise<Map<string, MetaCliente>> {
  const tenants = await basePrisma.tenant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      slug: true,
      subdomain: true,
      arcaCuit: true,
      arcaPuntoVenta: true,
      arcaHomologacion: true,
      bancosCapFacturasMes: true,
    },
  });
  return new Map(
    tenants.map((t) => [
      t.id,
      {
        nombre: t.name,
        slug: t.slug,
        subdomain: t.subdomain,
        arcaCuit: t.arcaCuit,
        arcaPuntoVenta: t.arcaPuntoVenta,
        arcaHomologacion: t.arcaHomologacion,
        capFacturasMes: t.bancosCapFacturasMes,
      },
    ]),
  );
}

/**
 * Puertos reales del recorrido. Los DATOS de cada cliente se leen con UNA
 * `tenantTransaction` con SU tenantId (GUC = cliente, RLS intacta, cero bypass): volumen y
 * hechos del monitoreo salen de la misma pasada. `ctx` es un solo reloj para toda la cartera.
 */
function portsDelRecorrido(ctx: ContextoRecoleccion): RecorridoPorts {
  return {
    filasDeCartera: filasDeCarteraDb,
    metadataClientes: metadataClientesDb,
    recolectar: (fila, meta) =>
      tenantTransaction((tx) => recolectarCliente(tx, fila, meta, ctx), {
        tenantId: fila.clienteTenantId,
      }),
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * La consola del contador: volumen de la cartera y "de quién me ocupo hoy", en una pasada.
 *
 * Es la ÚNICA puerta a `recolectarCliente`, y no recibe parámetros A PROPÓSITO: el estudio
 * sale de la sesión (exigirEstudio) y los clientes, de SU cartera. Llamarla desde la consola
 * del navegador con un tenantId ajeno no tiene dónde meterlo.
 */
export async function monitorCarteraAction(): Promise<ResultadoMonitorCartera> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;

  const ahora = new Date();
  const plataforma: ContextoPlataforma = {
    emisionHabilitada: isInvoicingEnabled(),
    modoArca: modoDesdeEnv(),
  };
  const ctx: ContextoRecoleccion = {
    filtros: filtrosFacturacionMes(ahora),
    inicioDeHoy: businessWallTimeToUtc(dateStrInBusinessTz(ahora), "00:00"),
    leerFronteraCaja: lastClosedDayTx,
  };

  try {
    const { filas, resumen, hechos } = await recorrerCartera(
      portsDelRecorrido(ctx),
      gate.estudioTenantId,
      plataforma.modoArca,
    );
    return {
      ok: true,
      filas,
      resumen,
      monitor: evaluarCartera(hechos, ahora.toISOString(), plataforma),
    };
  } catch (e) {
    // P2021/P2022: tabla/columna inexistente → hay una migración que el código ya espera y
    // la base todavía no tiene (Gate 2). Estado honesto, no un 500.
    const code = (e as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") {
      return {
        ok: false,
        migracionPendiente: true,
        error:
          "Falta aplicar migraciones pendientes de la base (paso del dueño). Cuando se apliquen, el panel se enciende solo.",
      };
    }
    throw e;
  }
}

/** Lo que contesta «Agregar un cliente». El éxito lleva SIEMPRE la misma frase, con cualquier CUIT. */
export type ResultadoSolicitudAlta = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * «Agregar un cliente» del panel del contador: deja un PEDIDO de alta para Soporte GSG, que lo
 * configura desde la consola (/operador/solicitudes). GSG-20 de raíz: la action NO mira la
 * plataforma —ni la tabla Tenant, ni otros negocios, ni la fábrica—, así que un CUIT libre, uno de
 * otro negocio y uno inexistente recorren el MISMO camino y reciben la MISMA respuesta. Los únicos
 * errores posibles dependen de lo que se escribió (`validarSolicitudAlta`, pura) o de que la base no
 * responda (igual para cualquier CUIT).
 *
 * DÓNDE SE GUARDA (sin migración): una fila de `AuditLog` del ESTUDIO, acción
 * `cartera.solicitud_alta`. Por qué AuditLog y no OutboxEvent: el outbox tiene despachantes que
 * toman todo evento pendiente (ARCA e integraciones, con reintentos y `muertoEn`); un pedido que
 * resuelve una persona no es un evento a despachar, y meterlo ahí arriesga que un worker lo tome o
 * lo cuente como envío fallido. AuditLog es de sólo agregar, tiene RLS por el tenant del estudio y
 * es exactamente «quién pidió qué y cuándo». El cierre del pedido es otra fila (acción
 * `cartera.solicitud_configurada`, entityId = id del pedido): nada se edita.
 *
 * Idempotente: con un pedido ABIERTO del mismo CUIT en este estudio, no se crea otro (candado por
 * estudio+CUIT dentro de la transacción: dos clics simultáneos dejan uno). Sólo lee filas del propio
 * estudio: no revela nada ajeno.
 */
export async function altaClienteCarteraAction(input: SolicitudAltaInput): Promise<ResultadoSolicitudAlta> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  const estudioTenantId = gate.estudioTenantId;

  const v = validarSolicitudAlta(input ?? {});
  if (!v.ok) return v;
  const s = v.solicitud;
  const usuario = await getCurrentUser();

  try {
    await tenantTransaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`solicitud-alta:${estudioTenantId}:${s.cuit}`}))`;
        const pedidos = await tx.auditLog.findMany({
          where: {
            tenantId: estudioTenantId,
            action: ACCION_SOLICITUD_ALTA,
            entity: ENTIDAD_SOLICITUD,
            changes: { path: ["cuit"], equals: s.cuit },
          },
          select: { id: true },
        });
        if (pedidos.length > 0) {
          // Cerrado = configurado O descartado: la misma lista que usa la bandeja de Soporte.
          const cerrados = await tx.auditLog.findMany({
            where: {
              tenantId: estudioTenantId,
              action: { in: [...ACCIONES_QUE_CIERRAN_LA_SOLICITUD] },
              entity: ENTIDAD_SOLICITUD,
              entityId: { in: pedidos.map((p) => p.id) },
            },
            select: { entityId: true },
          });
          const ids = pedidos.map((p) => p.id);
          if (hayPedidoAbierto(ids, cerrados.map((c) => c.entityId))) return; // ya hay uno abierto: no se duplica
        }
        await tx.auditLog.create({
          data: {
            tenantId: estudioTenantId,
            actor: usuario ? `user:${usuario.id}` : "admin",
            action: ACCION_SOLICITUD_ALTA,
            entity: ENTIDAD_SOLICITUD,
            channel: "admin",
            changes: { ...s },
          },
        });
      },
      { tenantId: estudioTenantId },
    );
  } catch (e) {
    // Sin datos del cliente en el log (ni CUIT ni email): sólo el estudio y el tipo de error.
    console.error("[cartera.solicitud_alta] no se pudo guardar el pedido", {
      estudioTenantId,
      error: e instanceof Error ? e.name : "desconocido",
    });
    return { ok: false, error: ERROR_AL_GUARDAR_SOLICITUD };
  }
  return { ok: true, mensaje: RESPUESTA_SOLICITUD_ALTA };
}

/** Pausar / reactivar / dar de baja una fila de la cartera (nunca borra datos). */
export async function setEstadoCarteraAction(
  clienteTenantId: string,
  estado: EstadoCartera,
): Promise<ResultadoSimpleCartera> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;

  if (estado !== "activa" && estado !== "pausada" && estado !== "baja") {
    return { ok: false, error: "Estado de cartera inválido." };
  }

  const pertenencia = await exigirClienteDeCartera(
    buscarFilaCartera,
    gate.estudioTenantId,
    clienteTenantId,
    { permitirPausada: true },
  );
  if (!pertenencia.ok) return pertenencia;

  await tenantTransaction(
    (tx) =>
      tx.carteraCliente.update({
        where: {
          tenantId_clienteTenantId: { tenantId: gate.estudioTenantId, clienteTenantId },
        },
        data: { estado },
      }),
    { tenantId: gate.estudioTenantId },
  );
  await auditAdmin({
    action: "cartera.estado",
    entity: "CarteraCliente",
    entityId: clienteTenantId,
    changes: { estudioTenantId: gate.estudioTenantId, clienteTenantId, estado },
  });
  revalidatePath(CONTADOR_PATH);
  return { ok: true };
}

/**
 * Acción en lote del panel: emite las propuestas automáticas de UN cliente de la
 * cartera. Reusa el core de bancos (`emitirPropuestas`) con el tenantId del
 * CLIENTE inyectado de forma explícita y segura (runInTenantContext +
 * tenantTransaction adentro del core) — solo tras verificar la pertenencia
 * estricta estudio→cliente y que la fila esté ACTIVA.
 */
export async function emitirAutomaticasClienteAction(
  clienteTenantId: string,
): Promise<ResultadoEmisionCliente> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;

  const pertenencia = await exigirClienteDeCartera(
    buscarFilaCartera,
    gate.estudioTenantId,
    clienteTenantId,
  );
  if (!pertenencia.ok) return pertenencia;

  const resultado = await emitirPropuestas(clienteTenantId, "auto");
  await auditAdmin({
    action: "cartera.emitir_automaticas",
    entity: "CarteraCliente",
    entityId: clienteTenantId,
    changes: { estudioTenantId: gate.estudioTenantId, clienteTenantId, resultado },
  });
  revalidatePath(CONTADOR_PATH);
  return { ok: true, resultado };
}
