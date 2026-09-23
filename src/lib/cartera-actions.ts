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
import type { PrismaClient } from "@/generated/prisma/client";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
// Alta de cartera = crear un tenant y abrir una concesión para emitir facturas ARCA a
// nombre de un CUIT ajeno. `audit-core.ts` dice que toda mutación de negocio pasa por acá,
// y este camino era el que no pasaba. `audit()` nunca lanza: auditar no puede voltear el alta.
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { provisionTenant } from "../../scripts/provision-tenant";
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
  avisoDeChoqueAlContador,
  choqueDePuntoDeVenta,
  elegirNegocioDelCuit,
  motivoCuitAmbiguo,
} from "@/app/operador/(console)/tenants/[id]/candado-punto-venta";
import {
  crearClienteProvisioning,
  decidirPuntoVentaAlta,
  exigirClienteDeCartera,
  recolectarCliente,
  recorrerCartera,
  resolverSlugCliente,
  validarAltaCliente,
  type AltaClienteInput,
  type ContextoRecoleccion,
  type EstadoCartera,
  type FilaCartera,
  type FilaCarteraDb,
  type MetaCliente,
  type RecorridoPorts,
  type ResumenCartera,
} from "@/lib/cartera-core";

const CONTADOR_PATH = "/contador";

/** Módulos que se le asignan a cada cliente del contador (facturación pura). */
const MODULOS_CLIENTE = ["arca", "bancos"] as const;

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

export type ResultadoAlta =
  | {
      ok: true;
      clienteTenantId: string;
      slug: string;
      alias: string;
      /** Solo si el alta creó el OWNER del cliente: mostrar UNA vez (patrón ADR-019). */
      passwordBootstrap?: string;
      /** true si el cliente ya estaba en la cartera (alta idempotente). */
      yaEstaba: boolean;
      /** Algo que el alta NO hizo y el contador tiene que saber (hoy: el punto de venta). */
      aviso?: string;
    }
  | { ok: false; error: string };

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

/**
 * Escribe los datos fiscales de un cliente con el candado del punto de venta: el mismo lock por
 * CUIT que la consola de operador (`arca-punto-venta:<cuit>`, operator-actions.ts) y la misma
 * regla (`choqueDePuntoDeVenta`). Si otro negocio de ese CUIT ya numera con ese punto de venta,
 * el punto de venta NO se escribe (el resto sí) y se avisa: dos negocios con el mismo talonario
 * en ARCA se rechazan las facturas entre sí.
 *
 * `soloSiNoTenia`: la re-alta completa el punto de venta si faltaba y nunca lo pisa; si otro lo
 * cargó entre la lectura y acá, no escribe.
 */
async function escribirFiscalConCandado(opts: {
  tenantId: string;
  cuit: string;
  puntoVenta: number | null;
  soloSiNoTenia: boolean;
  data: { arcaCuit?: string; arcaHomologacion?: boolean; modules?: string[] };
}): Promise<{ pvCargado: boolean; choque: boolean }> {
  const { tenantId, cuit, soloSiNoTenia, data } = opts;
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`arca-punto-venta:${cuit}`}))`;
    let pv = opts.puntoVenta;
    let choque = false;
    if (pv !== null) {
      // Tenant está fuera de RLS: se leen los otros negocios del CUIT, sólo datos de control.
      const otros = await tx.tenant.findMany({
        where: { arcaCuit: cuit, id: { not: tenantId } },
        select: { id: true, name: true, slug: true, arcaCuit: true, arcaPuntoVenta: true },
      });
      if (choqueDePuntoDeVenta({ tenantId, cuit, puntoVenta: pv }, otros)) {
        pv = null;
        choque = true;
      }
    }
    if (pv === null && Object.keys(data).length === 0) return { pvCargado: false, choque };
    const r = await tx.tenant.updateMany({
      where: { id: tenantId, ...(soloSiNoTenia && pv !== null ? { arcaPuntoVenta: null } : {}) },
      data: { ...data, ...(pv !== null ? { arcaPuntoVenta: pv } : {}) },
    });
    return { pvCargado: pv !== null && r.count === 1, choque };
  });
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

/**
 * Alta de un cliente en la cartera: valida CUIT/email, REUSA el core de
 * provisioning (ADR-019) para crear el tenant del cliente (blueprint generico,
 * sin catálogo demo, módulos arca+bancos), setea su config ARCA (CUIT +
 * homologación — modelo de cert delegado de GSG) y crea la fila CarteraCliente.
 * Idempotente por CUIT (re-alta del mismo negocio no duplica) y por slug (el
 * core de ADR-019). La contraseña de bootstrap del OWNER del cliente se devuelve
 * UNA vez y no se persiste en claro.
 */
export async function altaClienteCarteraAction(input: AltaClienteInput): Promise<ResultadoAlta> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  const estudioTenantId = gate.estudioTenantId;

  const v = validarAltaCliente(input);
  if (!v.ok) return v;

  // Idempotencia por CUIT: si ya hay un negocio con ese CUIT, no se provisiona otro. Pueden ser
  // VARIOS (una marca con un negocio por local, todos con el mismo CUIT): se elige entre los de
  // ESTA cartera, desempatando por el punto de venta, y nunca uno cualquiera
  // (`elegirNegocioDelCuit`). Antes era un `findFirst`: el primero que devolviera la base.
  const conEseCuit = await basePrisma.tenant.findMany({
    where: { arcaCuit: v.cuit },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, arcaPuntoVenta: true },
  });
  const filasDeCartera = new Map<string, FilaCarteraDb>();
  for (const t of conEseCuit) {
    if (t.id === estudioTenantId) continue;
    const f = await buscarFilaCartera(estudioTenantId, t.id);
    if (f) filasDeCartera.set(t.id, f);
  }
  const eleccion = elegirNegocioDelCuit(
    estudioTenantId,
    conEseCuit.map((t) => ({ ...t, enMiCartera: filasDeCartera.has(t.id) })),
    v.puntoVenta,
  );
  if (eleccion.tipo === "propio") {
    return { ok: false, error: "Ese CUIT es el de tu propio estudio: no se agrega a la cartera." };
  }
  if (eleccion.tipo === "ambiguo") {
    return { ok: false, error: motivoCuitAmbiguo(eleccion.cantidad, eleccion.puntosDeVenta) };
  }
  if (eleccion.tipo !== "nuevo") {
    const porCuit = eleccion.tipo === "realta" ? eleccion.negocio : null;
    const fila = porCuit ? filasDeCartera.get(porCuit.id) : undefined;
    if (porCuit && fila) {
      // Re-alta idempotente: si estaba pausado o de baja, vuelve a activo.
      if (fila.estado !== "activa") {
        await tenantTransaction(
          (tx) =>
            tx.carteraCliente.update({
              where: { tenantId_clienteTenantId: { tenantId: estudioTenantId, clienteTenantId: porCuit.id } },
              data: { estado: "activa" },
            }),
          { tenantId: estudioTenantId },
        );
      }
      // Punto de venta: la re-alta de un cliente de ESTA cartera puede completarlo si
      // faltaba — es el mismo dato que acepta el alta. Nunca lo PISA (`decidirPuntoVentaAlta`),
      // y si otro lo cargó entre la lectura y acá, no escribe (`soloSiNoTenia`). Pasa por el
      // candado: si otro negocio de ese CUIT ya numera con ese punto de venta, no se escribe
      // (antes se escribía sin mirar a los demás).
      const pv = decidirPuntoVentaAlta(v.puntoVenta, porCuit.arcaPuntoVenta);
      const escrito =
        pv.escribir !== null
          ? await escribirFiscalConCandado({
              tenantId: porCuit.id,
              cuit: v.cuit,
              puntoVenta: pv.escribir,
              soloSiNoTenia: true,
              data: {},
            })
          : { pvCargado: false, choque: false };
      const pvCargado = escrito.pvCargado;
      const aviso =
        pv.escribir !== null && escrito.choque
          ? avisoDeChoqueAlContador(pv.escribir)
          : pv.escribir !== null && !pvCargado
            ? "No se cargó el punto de venta: alguien lo cargó mientras tanto. Si está mal, pedíselo a Gestión Studio Grow."
            : pv.aviso;
      if (fila.estado !== "activa" || pvCargado) revalidatePath(CONTADOR_PATH);
      await auditAdmin({
        action: "cartera.realta",
        entity: "CarteraCliente",
        entityId: porCuit.id,
        changes: {
          estudioTenantId,
          clienteTenantId: porCuit.id,
          cuit: v.cuit,
          estadoAnterior: fila.estado,
          estado: "activa",
          ...(pvCargado ? { arcaPuntoVenta: pv.escribir } : {}),
        },
      });
      return {
        ok: true,
        clienteTenantId: porCuit.id,
        slug: porCuit.slug,
        alias: fila.alias,
        yaEstaba: true,
        ...(aviso ? { aviso } : {}),
      };
    }
    // Existe en la plataforma pero NO en esta cartera: vincularlo es una decisión
    // de gobierno (¿de quién es ese tenant?), no un auto-attach. Cero fuga de datos.
    return {
      ok: false,
      error:
        "Ese CUIT ya está registrado en la plataforma. Escribile a Gestión Studio Grow para vincularlo a tu cartera.",
    };
  }

  // Slug seguro: jamás adjuntarse por slug a un negocio de OTRO CUIT.
  const slugRes = await resolverSlugCliente(v.slugBase, v.cuit, (slug) =>
    basePrisma.tenant.findUnique({ where: { slug }, select: { arcaCuit: true } }),
  );
  if (!slugRes.ok) return slugRes;

  // REUSO del core de ADR-019 (no se reinventa el alta): atómico e idempotente.
  // La fachada setea el GUC de RLS apenas existe la fila Tenant → funciona con el
  // rol de la app (app_rls), sin operatorPrisma (ver cartera-core).
  let resultado;
  try {
    resultado = await provisionTenant(
      crearClienteProvisioning(basePrisma) as unknown as PrismaClient,
      {
        name: v.nombre,
        slug: slugRes.slug,
        owner: { name: v.nombre, email: v.email },
        blueprint: "generico",
        // Cliente de facturación pura: sin catálogo demo (menos ruido, alta liviana).
        skipCatalog: true,
        platform: { modules: [...MODULOS_CLIENTE] },
      },
    );
  } catch (e) {
    // Acá cae, entre otros, el gate ADR-018 (no crear tenant sin RLS activa).
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Config fiscal del cliente + módulos garantizados (aditivo, idempotente).
  // Tenant está fuera de RLS; es metadata de control del tenant recién creado/reusado.
  const actual = await basePrisma.tenant.findUnique({
    where: { id: resultado.tenantId },
    select: { modules: true, arcaPuntoVenta: true },
  });
  const modulos = new Set([...(actual?.modules ?? []), ...MODULOS_CLIENTE]);
  // El punto de venta del alta sólo entra si el tenant no tenía uno, y si el que tenía es
  // otro se avisa (mismo criterio que la re-alta: `decidirPuntoVentaAlta`). Y pasa por el
  // candado: si otro negocio de ese CUIT ya numera con ese punto de venta, no se carga.
  const pv = decidirPuntoVentaAlta(v.puntoVenta, actual?.arcaPuntoVenta ?? null);
  const escrito = await escribirFiscalConCandado({
    tenantId: resultado.tenantId,
    cuit: v.cuit,
    puntoVenta: pv.escribir,
    soloSiNoTenia: false,
    data: {
      arcaCuit: v.cuit,
      // Modelo de delegación: UN cert de GSG para N CUITs — hoy SIEMPRE homologación
      // (CUIT 20376833098); producción ARCA es un paso posterior del dueño.
      arcaHomologacion: true,
      modules: [...modulos],
    },
  });
  const puntoVenta = escrito.pvCargado ? pv.escribir : null;
  const avisoPv = escrito.choque && pv.escribir !== null ? avisoDeChoqueAlContador(pv.escribir) : pv.aviso;

  // La fila de la cartera (dato del ESTUDIO — tenant del estudio, RLS incluida).
  await tenantTransaction(
    (tx) =>
      tx.carteraCliente.upsert({
        where: {
          tenantId_clienteTenantId: {
            tenantId: estudioTenantId,
            clienteTenantId: resultado.tenantId,
          },
        },
        update: { estado: "activa" },
        create: {
          tenantId: estudioTenantId,
          clienteTenantId: resultado.tenantId,
          alias: v.alias,
          estado: "activa",
        },
      }),
    { tenantId: estudioTenantId },
  );

  await auditAdmin({
    action: "cartera.alta",
    entity: "CarteraCliente",
    entityId: resultado.tenantId,
    changes: {
      estudioTenantId,
      clienteTenantId: resultado.tenantId,
      slug: resultado.slug,
      alias: v.alias,
      // El dato que importa reconstruir seis meses después: a nombre de qué CUIT quedó
      // habilitado este estudio para emitir, y con qué módulos.
      cuit: v.cuit,
      arcaHomologacion: true,
      ...(puntoVenta !== null ? { arcaPuntoVenta: puntoVenta } : {}),
      modulos: [...modulos],
    },
  });

  revalidatePath(CONTADOR_PATH);
  return {
    ok: true,
    clienteTenantId: resultado.tenantId,
    slug: resultado.slug,
    alias: v.alias,
    yaEstaba: false,
    ...(resultado.generatedPassword ? { passwordBootstrap: resultado.generatedPassword } : {}),
    ...(avisoPv ? { aviso: avisoPv } : {}),
  };
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
