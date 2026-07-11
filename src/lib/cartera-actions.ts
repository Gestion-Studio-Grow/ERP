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
// vía los cores de bancos-glue con tenantId EXPLÍCITO (tenantTransaction /
// runInTenantContext) y SIEMPRE tras verificar la pertenencia a la cartera.
// Jamás operatorPrisma en este camino. La única lectura con `basePrisma` es la
// tabla Tenant (fuera de RLS por diseño — raíz del aislamiento) para metadata de
// clientes ya verificados.
//
// NOTA Gate 2: la migración `20260711140000_add_cartera_cliente` NO está aplicada
// a Neon — en prod el panel muestra su estado honesto hasta ese OK del dueño.

import { revalidatePath } from "next/cache";
import type { PrismaClient } from "@/generated/prisma/client";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { provisionTenant } from "../../scripts/provision-tenant";
import {
  emitirPropuestas,
  kpisFacturacionBancaria,
  type ResultadoEmision,
} from "@/lib/bancos-glue";
import {
  MODULO_CARTERA,
  crearClienteProvisioning,
  exigirClienteDeCartera,
  listarCarteraCore,
  resolverSlugCliente,
  validarAltaCliente,
  type AltaClienteInput,
  type CarteraPorts,
  type EstadoCartera,
  type FilaCartera,
  type FilaCarteraDb,
  type ResumenCartera,
  type ResumenFiscalCliente,
} from "@/lib/cartera-core";

const CONTADOR_PATH = "/contador";

/** Módulos que se le asignan a cada cliente del contador (facturación pura). */
const MODULOS_CLIENTE = ["arca", "bancos"] as const;

// ── Tipos de retorno (los consume la UI de /contador) ────────────────────────
// FilaCartera/ResumenCartera/EstadoCartera NO se re-exportan desde acá (Turbopack
// registra los re-exports de un módulo "use server" como actions): la UI los
// importa de "@/lib/cartera-core" con `import type`.

export type ResultadoCartera =
  | { ok: true; filas: FilaCartera[]; resumen: ResumenCartera }
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
  // registry: sin el módulo `cartera` asignado, el panel no existe para ese tenant.
  const tenant = await basePrisma.tenant.findUnique({
    where: { id: estudioTenantId },
    select: { modules: true },
  });
  if (!tenant?.modules?.includes(MODULO_CARTERA)) {
    return { ok: false, error: "El módulo Cartera no está habilitado para este negocio." };
  }
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

const portsReales: CarteraPorts = {
  filasDeCartera: filasDeCarteraDb,
  // Tenant está fuera de RLS por diseño (raíz del aislamiento): esta lectura es
  // METADATA de un cliente cuya pertenencia a la cartera ya está verificada por
  // filasDeCartera / exigirClienteDeCartera. No lee datos de negocio del cliente.
  async datosCliente(clienteTenantId) {
    const t = await basePrisma.tenant.findUnique({
      where: { id: clienteTenantId },
      select: { name: true, slug: true, subdomain: true, arcaCuit: true, arcaHomologacion: true },
    });
    return t
      ? {
          nombre: t.name,
          slug: t.slug,
          subdomain: t.subdomain,
          arcaCuit: t.arcaCuit,
          arcaHomologacion: t.arcaHomologacion,
        }
      : null;
  },
  // Los DATOS del cliente: SOLO vía el core de bancos-glue, que corre todo dentro
  // de tenantTransaction(clienteTenantId) — RLS intacta, cero bypass.
  async resumenFiscalCliente(clienteTenantId): Promise<ResumenFiscalCliente> {
    const kpis = await kpisFacturacionBancaria(clienteTenantId);
    const ultima = kpis.ultimasImportaciones[0];
    return {
      facturasMes: kpis.facturasMes,
      capFacturasMes: kpis.capFacturasMes,
      montoFacturadoMes: kpis.montoFacturadoMes,
      pendientesRevision: kpis.pendientesRevision,
      listasParaEmitir: kpis.listasParaEmitir,
      ultimaImportacion: ultima
        ? { nombreArchivo: ultima.nombreArchivo, createdAt: ultima.createdAt }
        : null,
    };
  },
};

// ── Actions ───────────────────────────────────────────────────────────────────

/** La cartera del estudio actual: filas + KPIs. */
export async function listarCarteraAction(): Promise<ResultadoCartera> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;

  try {
    const { filas, resumen } = await listarCarteraCore(portsReales, gate.estudioTenantId);
    return { ok: true, filas, resumen };
  } catch (e) {
    // P2021/P2022: tabla/columna inexistente → la migración de cartera (o la de
    // bancos) todavía no se aplicó (Gate 2). Estado honesto, no un 500.
    const code = (e as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") {
      return {
        ok: false,
        migracionPendiente: true,
        error:
          "Falta aplicar la migración 20260711140000_add_cartera_cliente (paso del dueño). Cuando se aplique, el panel se enciende solo.",
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

  // Idempotencia por CUIT: si ya hay un tenant con ese CUIT, no se provisiona otro.
  const porCuit = await basePrisma.tenant.findFirst({
    where: { arcaCuit: v.cuit },
    select: { id: true, slug: true },
  });
  if (porCuit) {
    if (porCuit.id === estudioTenantId) {
      return { ok: false, error: "Ese CUIT es el de tu propio estudio: no se agrega a la cartera." };
    }
    const fila = await buscarFilaCartera(estudioTenantId, porCuit.id);
    if (fila) {
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
        revalidatePath(CONTADOR_PATH);
      }
      return { ok: true, clienteTenantId: porCuit.id, slug: porCuit.slug, alias: fila.alias, yaEstaba: true };
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
    select: { modules: true },
  });
  const modulos = new Set([...(actual?.modules ?? []), ...MODULOS_CLIENTE]);
  await basePrisma.tenant.update({
    where: { id: resultado.tenantId },
    data: {
      arcaCuit: v.cuit,
      // Modelo de delegación: UN cert de GSG para N CUITs — hoy SIEMPRE homologación
      // (CUIT 20376833098); producción ARCA es un paso posterior del dueño.
      arcaHomologacion: true,
      modules: [...modulos],
    },
  });

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

  revalidatePath(CONTADOR_PATH);
  return {
    ok: true,
    clienteTenantId: resultado.tenantId,
    slug: resultado.slug,
    alias: v.alias,
    yaEstaba: false,
    ...(resultado.generatedPassword ? { passwordBootstrap: resultado.generatedPassword } : {}),
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
  revalidatePath(CONTADOR_PATH);
  return { ok: true, resultado };
}
