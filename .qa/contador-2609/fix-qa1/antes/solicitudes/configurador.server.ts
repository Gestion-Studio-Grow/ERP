// ============================================================================
// CONFIGURADOR DE CLIENTES DE ESTUDIO (Soporte GSG) — el servidor.
// ============================================================================
//
// NO lleva "use server" (no es un endpoint): lo llama `actions.ts` después de la sesión de operador,
// y los tests lo ejecutan contra Postgres con el cliente del operador. Recibe la base por parámetro.
//
// `configurarSolicitud` hace TODO en UNA transacción (todo o nada):
//   · candado por pedido: un doble clic espera al primero y ve el pedido ya cerrado → un solo negocio;
//   · candado por CUIT (el mismo que la consola usa para el punto de venta): dos pedidos del mismo CUIT
//     desde dos estudios no crean dos negocios;
//   · si el CUIT ya existe en la plataforma, se VINCULA ese negocio a la cartera (no se duplica), sólo
//     si Soporte confirma que su dueño lo autorizó, y no se le toca ni plan, ni apps, ni usuarios;
//   · tope de la cartera del estudio (plan Estudio, `clientesCartera`) bajo candado;
//   · si no existe, la fábrica de ADR-019 (`provisionTenant`) lo crea DENTRO de esta transacción;
//   · usuario del dueño con contraseña temporal; la contadora entra por la cartera del ESTUDIO (C-4 de
//     30-LANZAMIENTO/uat/configurador-cliente-estudio.md): si hace falta, su acceso se crea en el estudio,
//     con el tope de personas de su plan. Las claves se devuelven UNA vez y no se guardan en claro;
//   · las columnas de la ventana M1 se consultan antes de escribir (una sentencia fallida aborta la tx);
//   · cualquier rechazo se LANZA dentro de la transacción: no queda nada a medias.
//   · auditoría: en el negocio del cliente (quién lo configuró y cómo) y en el estudio (el alta en su
//     cartera y el cierre del pedido).
//   · CH (beauty-spa) sólo la toca el dueño: la misma regla que el resto de la consola.

import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { provisionTenant } from "../../../../../scripts/provision-tenant";
import { generateStrongPassword, hashPassword } from "@/lib/auth-password";
import { crearClienteProvisioning, resolverSlugCliente } from "@/lib/cartera-core";
import { parseTenantHostMap } from "@/lib/tenant";
import { leerLimitesEnTx } from "@/lib/limites-del-negocio-en-tx";
import { decidirAltaDeUsuarioEnTx } from "@/lib/usuarios-del-plan";
import { decidirAlta, NO_SE_PUDO_CONTAR } from "@/planes/limites";
import { suggestSlug } from "@/lib/provisioning/slug";
import { decidirAcceso, direccionDelLocal } from "@/lib/multilocal/multilocal-core";
import { decidirOperadorParaNegocios } from "@/lib/operador/guardia-negocio-core";
import { choqueDePuntoDeVenta } from "@/app/operador/(console)/tenants/[id]/candado-punto-venta";
import {
  ACCION_SOLICITUD_ALTA,
  ACCION_SOLICITUD_CONFIGURADA,
  ACCION_SOLICITUD_DESCARTADA,
  ACCIONES_QUE_CIERRAN_LA_SOLICITUD,
  ENTIDAD_SOLICITUD,
  leerSolicitudGuardada,
  type SolicitudAlta,
} from "@/lib/cartera-alta-reglas";
import {
  ACCION_ALTA_POR_SOPORTE,
  ACCION_CONFIGURADOR_ALTA,
  AVISO_VINCULO_SIN_AUTORIZACION,
  BLUEPRINT_DEL_RUBRO,
  EMAIL_DEL_CLIENTE_ES_DEL_ESTUDIO,
  modulosDelAlta,
  usuarioDelActor,
  validarConfiguracion,
  type FormConfigurador,
} from "./configurador-reglas";

type Tx = Prisma.TransactionClient;

/** Un pedido de la bandeja de Soporte. */
export interface SolicitudPendiente {
  id: string;
  creado: Date;
  estudio: { id: string; nombre: string; slug: string; whatsapp: string | null };
  pedidoPor: { nombre: string; email: string } | null;
  datos: SolicitudAlta;
  /** Negocios que ya tienen ese CUIT en la plataforma (sólo para Soporte). */
  yaExisten: { id: string; nombre: string; slug: string; puntoVenta: number | null }[];
}

export interface UsuarioEntregado {
  quien: "cliente" | "contadora";
  nombre: string;
  email: string;
  /** Contraseña temporal. `null`: ya tenía usuario ahí y conserva su contraseña. */
  clave: string | null;
}

// ── Bandeja ──────────────────────────────────────────────────────────────────

async function cerrados(db: PrismaClient | Tx, ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const filas = await db.auditLog.findMany({
    where: { action: { in: [...ACCIONES_QUE_CIERRAN_LA_SOLICITUD] }, entity: ENTIDAD_SOLICITUD, entityId: { in: ids } },
    select: { entityId: true, changes: true },
  });
  return new Map(
    filas.map((f) => [f.entityId ?? "", ((f.changes as { clienteTenantId?: string } | null)?.clienteTenantId ?? null)]),
  );
}

/** Los pedidos abiertos de todos los estudios, del más viejo al más nuevo (paginado: `limite`). */
export async function listarSolicitudesPendientes(db: PrismaClient, limite = 50): Promise<SolicitudPendiente[]> {
  const pedidos = await db.auditLog.findMany({
    where: { action: ACCION_SOLICITUD_ALTA, entity: ENTIDAD_SOLICITUD },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: { id: true, tenantId: true, actor: true, changes: true, createdAt: true },
  });
  const listos = await cerrados(db, pedidos.map((p) => p.id));
  const abiertos = pedidos.filter((p) => !listos.has(p.id)).slice(0, limite);
  const salida: SolicitudPendiente[] = [];
  for (const p of abiertos) {
    const s = await armarSolicitud(db, p);
    if (s) salida.push(s);
  }
  return salida;
}

/** Un pedido por id (abierto o cerrado). `null` si no es un pedido de alta. */
export async function leerSolicitud(db: PrismaClient, id: string): Promise<(SolicitudPendiente & { cerrada: boolean }) | null> {
  const p = await db.auditLog.findUnique({
    where: { id },
    select: { id: true, tenantId: true, actor: true, changes: true, createdAt: true, action: true, entity: true },
  });
  if (!p || p.action !== ACCION_SOLICITUD_ALTA || p.entity !== ENTIDAD_SOLICITUD) return null;
  const s = await armarSolicitud(db, p);
  if (!s) return null;
  return { ...s, cerrada: (await cerrados(db, [id])).has(id) };
}

async function armarSolicitud(
  db: PrismaClient | Tx,
  p: { id: string; tenantId: string; actor: string; changes: unknown; createdAt: Date },
): Promise<SolicitudPendiente | null> {
  const datos = leerSolicitudGuardada(p.changes);
  if (!datos) return null;
  const estudio = await db.tenant.findUnique({
    where: { id: p.tenantId },
    select: { id: true, name: true, slug: true, businessSettings: { select: { whatsapp: true } } },
  });
  if (!estudio) return null;
  const uid = usuarioDelActor(p.actor);
  const quien = uid
    ? await db.user.findFirst({ where: { id: uid, tenantId: p.tenantId }, select: { name: true, email: true } })
    : null;
  const yaExisten = await db.tenant.findMany({
    where: { arcaCuit: datos.cuit, id: { not: p.tenantId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, arcaPuntoVenta: true },
  });
  return {
    id: p.id,
    creado: p.createdAt,
    estudio: { id: estudio.id, nombre: estudio.name, slug: estudio.slug, whatsapp: estudio.businessSettings?.whatsapp ?? null },
    pedidoPor: quien ? { nombre: quien.name, email: quien.email } : null,
    datos,
    yaExisten: yaExisten.map((t) => ({ id: t.id, nombre: t.name, slug: t.slug, puntoVenta: t.arcaPuntoVenta })),
  };
}

// ── Configurar ───────────────────────────────────────────────────────────────

/** Rechazo dentro de la transacción: se LANZA para que Postgres deshaga todo (nunca un return a medias). */
class Rechazo extends Error {}

/** Las filas de un negocio se escriben con SU negocio en el GUC de RLS (inocuo con el rol exento). */
async function enNegocio(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
}

/**
 * Columnas de la ventana M1 (`Tenant.arcaCondicionIva`, `User.mustChangePassword`). Se PREGUNTA antes
 * de escribir: una sentencia que falla deja la transacción abortada y atraparla no alcanza.
 */
async function columnasDeM1(tx: Tx): Promise<{ condicionIva: boolean; cambioDeClave: boolean }> {
  const filas = await tx.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'Tenant' AND column_name = 'arcaCondicionIva')
        OR (table_name = 'User' AND column_name = 'mustChangePassword'))`;
  return {
    condicionIva: filas.some((f) => f.column_name === "arcaCondicionIva"),
    cambioDeClave: filas.some((f) => f.column_name === "mustChangePassword"),
  };
}

/** Dirección que el deploy SÍ rutea (mapa de hosts o dominio propio), o `null`: no se promete otra. */
export function direccionDe(subdominio: string | null, ruta: string, env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  return direccionDelLocal(
    subdominio,
    { mapaDeHosts: parseTenantHostMap(env.TENANT_HOST_MAP), dominioPropio: env.APP_BASE_DOMAIN?.trim() || null },
    ruta,
  );
}

export type ResultadoConfigurador =
  | {
      ok: true;
      /** true: el pedido ya estaba cerrado (doble clic o reintento). No se creó nada y no hay claves. */
      yaConfigurada: boolean;
      clienteTenantId: string;
      nombre: string;
      slug: string;
      cuit: string;
      puntoVenta: number | null;
      whatsappCliente: string | null;
      /** Dirección del panel del cliente, o `null`: todavía no tiene (el «Pasale esto» lo dice). */
      direccion: string | null;
      estudio: { id: string; nombre: string; direccionCartera: string | null };
      /** true si se creó el negocio; false si se vinculó uno que ya existía con ese CUIT. */
      creado: boolean;
      usuarios: UsuarioEntregado[];
      /** Lo que depende de la ventana M1 y no se pudo escribir. */
      pendientes: { condicionIva: boolean; cambioDeClave: boolean };
      avisos: string[];
      auditoria: { operador: string; cuando: string };
    }
  | { ok: false; error: string };

type Ok = Extract<ResultadoConfigurador, { ok: true }>;

/**
 * Configura un pedido de alta: crea (o vincula) el negocio del cliente, su usuario, lo suma a la
 * cartera del estudio y cierra el pedido. Todo en UNA transacción: cualquier rechazo la deshace.
 */
export async function configurarSolicitud(
  db: PrismaClient,
  opts: { solicitudId: string; estudioTenantId?: string; sesion: { nombre: string; esDuenio: boolean }; form: FormConfigurador },
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<ResultadoConfigurador> {
  const v = validarConfiguracion(opts.form);
  if (!v.ok) return v;
  const c = v.config;
  const operador = opts.sesion.nombre;
  const actor = `operator:${operador}`;

  try {
    return await db.$transaction(
      async (tx): Promise<Ok> => {
        // 1) Un pedido a la vez: el doble clic espera acá y encuentra el pedido cerrado.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`configurar-solicitud:${opts.solicitudId}`}))`;
        const pedido = await tx.auditLog.findUnique({
          where: { id: opts.solicitudId },
          select: { id: true, tenantId: true, actor: true, action: true, entity: true },
        });
        if (!pedido || pedido.action !== ACCION_SOLICITUD_ALTA || pedido.entity !== ENTIDAD_SOLICITUD) {
          throw new Rechazo("Ese pedido no existe.");
        }
        // La acción pasó la guardia con el estudio del formulario: el pedido tiene que ser de ESE estudio.
        if (opts.estudioTenantId !== undefined && pedido.tenantId !== opts.estudioTenantId) throw new Rechazo("Ese pedido no existe.");
        const estudioId = pedido.tenantId;
        const estudio = await tx.tenant.findUnique({
          where: { id: estudioId },
          select: { id: true, slug: true, name: true, modules: true, arcaCuit: true, subdomain: true },
        });
        if (!estudio) throw new Rechazo("El estudio del pedido ya no existe.");
        const direccionCartera = direccionDe(estudio.subdomain, "/contador", env);
        const datosEstudio = { id: estudio.id, nombre: estudio.name, direccionCartera };

        // 2) Idempotencia: pedido ya cerrado → lo que quedó, sin crear nada ni mostrar claves.
        const previo = (await cerrados(tx, [pedido.id])).get(pedido.id);
        if (previo !== undefined) {
          const t = previo
            ? await tx.tenant.findUnique({
                where: { id: previo },
                select: { id: true, name: true, slug: true, subdomain: true, arcaCuit: true, arcaPuntoVenta: true },
              })
            : null;
          if (!t) throw new Rechazo("Ese pedido ya se cerró sin cliente (lo descartó Soporte).");
          return {
            ok: true, yaConfigurada: true, clienteTenantId: t.id, nombre: t.name, slug: t.slug,
            cuit: t.arcaCuit ?? c.cuit, puntoVenta: t.arcaPuntoVenta, whatsappCliente: c.whatsapp,
            direccion: direccionDe(t.subdomain, "/admin", env), estudio: datosEstudio, creado: false, usuarios: [],
            pendientes: { condicionIva: false, cambioDeClave: false }, avisos: [],
            auditoria: { operador, cuando: new Date().toISOString() },
          };
        }

        const acceso = decidirAcceso(estudio.modules, "estudio");
        if (!acceso.ok) throw new Rechazo(`El estudio no tiene la cartera activa: ${acceso.error}`);
        if (estudio.arcaCuit && estudio.arcaCuit === c.cuit) {
          throw new Rechazo("Ese CUIT es el del propio estudio: no se agrega a su cartera.");
        }

        // 3) Candado por CUIT (el mismo de la consola, la red y la pestaña Fiscal).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`arca-punto-venta:${c.cuit}`}))`;
        const conEseCuit = await tx.tenant.findMany({
          where: { arcaCuit: c.cuit, id: { not: estudioId } },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, slug: true, subdomain: true, arcaCuit: true, arcaPuntoVenta: true },
        });
        let existente = conEseCuit.length === 1 ? conEseCuit[0] : null;
        if (conEseCuit.length > 1) {
          const mismos = conEseCuit.filter((t) => t.arcaPuntoVenta === c.puntoVenta);
          if (mismos.length !== 1) {
            throw new Rechazo(
              `Hay ${conEseCuit.length} negocios con ese CUIT y el punto de venta ${c.puntoVenta} no elige uno solo. Vinculalo desde la ficha del negocio que corresponda.`,
            );
          }
          existente = mismos[0];
        }
        // Vincular un negocio que ya existe le abre sus datos al estudio: sólo con la autorización de su dueño.
        if (existente && !c.autorizaVinculo) throw new Rechazo(AVISO_VINCULO_SIN_AUTORIZACION);

        const guardia = decidirOperadorParaNegocios(opts.sesion, [estudio.slug, existente?.slug]);
        if (!guardia.ok) throw new Rechazo(guardia.motivo);

        // 4) Cupo de la cartera del estudio (limites.ts: `clientesCartera`), bajo su propio candado.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cartera:${estudioId}`}))`;
        await enNegocio(tx, estudioId);
        const filaCartera = existente
          ? await tx.carteraCliente.findUnique({
              where: { tenantId_clienteTenantId: { tenantId: estudioId, clienteTenantId: existente.id } },
              select: { estado: true },
            })
          : null;
        if (!filaCartera || filaCartera.estado === "baja") {
          const l = await leerLimitesEnTx(tx, estudioId);
          if (!l) throw new Rechazo(NO_SE_PUDO_CONTAR);
          const usados = await tx.carteraCliente.count({ where: { tenantId: estudioId, estado: { not: "baja" } } });
          const d = decidirAlta(l.limites, "clientesCartera", usados);
          if (!d.ok) throw new Rechazo(`La cartera del estudio está completa. ${d.motivo}`);
        }

        // El usuario del cliente tiene que ser del cliente (si no, la contadora quedaría de dueña por la puerta de atrás).
        const personasDelEstudio = await tx.user.findMany({
          where: { tenantId: estudioId, deletedAt: null },
          select: { email: true },
        });
        const emailsDelEstudio = new Set(personasDelEstudio.map((u) => u.email.toLowerCase()));
        if (!existente && emailsDelEstudio.has(c.email)) throw new Rechazo(EMAIL_DEL_CLIENTE_ES_DEL_ESTUDIO);

        if (!existente && c.subdominio) {
          const ocupado = await tx.tenant.findUnique({ where: { subdomain: c.subdominio }, select: { id: true } });
          if (ocupado) throw new Rechazo(`La dirección «${c.subdominio}» ya la usa otro negocio. Elegí otra.`);
        }

        const m1 = await columnasDeM1(tx);
        const avisos: string[] = [];
        const usuarios: UsuarioEntregado[] = [];
        let cliente: { id: string; name: string; slug: string; subdomain: string | null; arcaPuntoVenta: number | null };
        const creado = existente === null;
        const modulos = modulosDelAlta(c.plan, c.rubro);

        if (existente) {
          // 5a) Vincular, no duplicar: no se le toca plan, módulos, punto de venta, dirección ni usuarios.
          cliente = existente;
          if (existente.arcaPuntoVenta !== c.puntoVenta) {
            avisos.push(
              `Ese negocio ya factura con el punto de venta ${existente.arcaPuntoVenta ?? "(sin cargar)"}: no se cambió. Si está mal, se corrige desde su ficha.`,
            );
          }
          avisos.push("Ese CUIT ya estaba en la plataforma: se sumó a la cartera y conservó su plan, sus apps y sus usuarios.");
        } else {
          // 5b) Crear: la fábrica de ADR-019 corre DENTRO de esta transacción, con el GUC del negocio nuevo.
          const slug = await resolverSlugCliente(suggestSlug(c.razonSocial), c.cuit, (s) =>
            tx.tenant.findUnique({ where: { slug: s }, select: { arcaCuit: true } }),
          );
          if (!slug.ok) throw new Rechazo(slug.error);
          const enEstaTx = crearClienteProvisioning({ $transaction: (fn) => fn(tx) }) as unknown as PrismaClient;
          const r = await provisionTenant(enEstaTx, {
            name: c.razonSocial,
            slug: slug.slug,
            owner: { name: c.razonSocial, email: c.email },
            blueprint: BLUEPRINT_DEL_RUBRO[c.rubro],
            skipCatalog: true,
            branding: { whatsapp: c.whatsapp ?? undefined, email: c.email },
            platform: { plan: c.plan, modules: modulos, ...(c.subdominio ? { subdomain: c.subdominio } : {}) },
          });
          if (!r.tenantCreated) throw new Rechazo("Ese nombre corto ya era de otro negocio. Probá de nuevo.");
          await enNegocio(tx, r.tenantId);
          const choque = choqueDePuntoDeVenta({ tenantId: r.tenantId, cuit: c.cuit, puntoVenta: c.puntoVenta }, conEseCuit);
          if (choque) throw new Rechazo(`El punto de venta ${c.puntoVenta} ya lo usa «${choque.name}», del mismo CUIT.`);
          const t = await tx.tenant.update({
            where: { id: r.tenantId },
            data: {
              arcaCuit: c.cuit,
              arcaHomologacion: true,
              arcaPuntoVenta: c.puntoVenta,
              ...(m1.condicionIva ? { arcaCondicionIva: c.condicionIva } : {}),
            },
            select: { id: true, name: true, slug: true, subdomain: true, arcaPuntoVenta: true },
          });
          cliente = t;
          if (m1.cambioDeClave && r.generatedPassword) {
            await tx.$executeRaw`UPDATE "User" SET "mustChangePassword" = true WHERE "tenantId" = ${t.id} AND lower("email") = ${c.email}`;
          }
          usuarios.push({ quien: "cliente", nombre: c.razonSocial, email: c.email, clave: r.generatedPassword ?? null });
        }

        // 6) La cartera del estudio (con su GUC).
        await enNegocio(tx, estudioId);
        await tx.carteraCliente.upsert({
          where: { tenantId_clienteTenantId: { tenantId: estudioId, clienteTenantId: cliente.id } },
          update: { estado: "activa" },
          create: { tenantId: estudioId, clienteTenantId: cliente.id, alias: c.alias, estado: "activa" },
          select: { id: true },
        });

        // 7) Acceso de la contadora: por la cartera del ESTUDIO, nunca dueña del negocio del cliente.
        if (c.contadora.tipo === "nueva") {
          if (emailsDelEstudio.has(c.contadora.email)) {
            usuarios.push({ quien: "contadora", nombre: c.contadora.nombre, email: c.contadora.email, clave: null });
          } else {
            const d = await decidirAltaDeUsuarioEnTx(tx as never, estudioId);
            if (!d.ok) throw new Rechazo(`No se pudo crear el acceso de la persona del estudio. ${d.motivo}`);
            const clave = generateStrongPassword();
            const u = await tx.user.create({
              data: { tenantId: estudioId, name: c.contadora.nombre, email: c.contadora.email, passwordHash: await hashPassword(clave), role: "OWNER" },
              select: { id: true },
            });
            if (m1.cambioDeClave) await tx.$executeRaw`UPDATE "User" SET "mustChangePassword" = true WHERE "id" = ${u.id}`;
            usuarios.push({ quien: "contadora", nombre: c.contadora.nombre, email: c.contadora.email, clave });
          }
        } else {
          const uid = usuarioDelActor(pedido.actor);
          const quien = uid
            ? await tx.user.findFirst({
                where: { id: uid, tenantId: estudioId, active: true, deletedAt: null },
                select: { name: true, email: true },
              })
            : null;
          if (quien) usuarios.push({ quien: "contadora", nombre: quien.name, email: quien.email.toLowerCase(), clave: null });
          else avisos.push("La persona del estudio que hizo el pedido ya no tiene acceso: creale uno desde la ficha del estudio.");
        }

        if (creado && !m1.condicionIva) {
          avisos.push("La condición frente al IVA quedó anotada en el registro del alta. Se carga en la ficha, pestaña Fiscal, cuando esté disponible.");
        }
        if (usuarios.some((u) => u.clave) && !m1.cambioDeClave) {
          avisos.push("Todavía no se le puede exigir que cambie la contraseña en el primer ingreso: pedile que la cambie al entrar.");
        }

        // 8) Auditoría DENTRO de la transacción: si no se puede auditar, no hay alta. Sin claves ni teléfono.
        const direccion = direccionDe(cliente.subdomain, "/admin", env);
        const sinClaves = usuarios.map((u) => ({ quien: u.quien, email: u.email, creado: u.clave !== null }));
        await enNegocio(tx, cliente.id);
        await tx.auditLog.create({
          data: {
            tenantId: cliente.id, actor, action: ACCION_CONFIGURADOR_ALTA, entity: "Tenant", entityId: cliente.id, channel: "admin",
            changes: {
              solicitudId: pedido.id, estudioTenantId: estudioId, creado, cuit: c.cuit,
              condicionIva: c.condicionIva, condicionIvaEscrita: creado && m1.condicionIva,
              arcaPuntoVenta: cliente.arcaPuntoVenta,
              ...(creado ? { plan: c.plan, rubro: c.rubro, modulos, subdominio: c.subdominio } : { autorizaVinculo: true }),
              direccion: direccion ? "con-direccion" : "sin-direccion",
              usuarios: sinClaves.filter((u) => u.quien === "cliente"),
            },
          },
          select: { id: true },
        });
        await enNegocio(tx, estudioId);
        await tx.auditLog.create({
          data: {
            tenantId: estudioId, actor, action: ACCION_ALTA_POR_SOPORTE, entity: "CarteraCliente", entityId: cliente.id, channel: "admin",
            changes: { solicitudId: pedido.id, clienteTenantId: cliente.id, alias: c.alias, cuit: c.cuit, creado, ...(creado ? { plan: c.plan } : {}) },
          },
          select: { id: true },
        });
        const nueva = sinClaves.find((u) => u.quien === "contadora" && u.creado);
        if (nueva) {
          await tx.auditLog.create({
            data: { tenantId: estudioId, actor, action: "usuario.alta", entity: "User", channel: "admin", changes: { email: nueva.email, rol: "OWNER", porConfigurador: true } },
            select: { id: true },
          });
        }
        const cierre = await tx.auditLog.create({
          data: {
            tenantId: estudioId, actor, action: ACCION_SOLICITUD_CONFIGURADA, entity: ENTIDAD_SOLICITUD, entityId: pedido.id, channel: "admin",
            changes: { clienteTenantId: cliente.id, operador, creado },
          },
          select: { createdAt: true },
        });

        return {
          ok: true, yaConfigurada: false, clienteTenantId: cliente.id, nombre: cliente.name, slug: cliente.slug,
          cuit: c.cuit, puntoVenta: cliente.arcaPuntoVenta, whatsappCliente: c.whatsapp, direccion, estudio: datosEstudio,
          creado, usuarios, pendientes: { condicionIva: creado && !m1.condicionIva, cambioDeClave: !m1.cambioDeClave }, avisos,
          auditoria: { operador, cuando: cierre.createdAt.toISOString() },
        };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    throw e;
  }
}

/** Soporte descarta un pedido (repetido, datos imposibles). Sale de la bandeja; queda en la auditoría del estudio. */
export async function descartarSolicitud(
  db: PrismaClient,
  opts: { solicitudId: string; estudioTenantId?: string; sesion: { nombre: string; esDuenio: boolean }; motivo: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const motivo = opts.motivo.trim().replace(/\s+/g, " ");
  if (motivo.length < 3 || motivo.length > 300) return { ok: false, error: "Escribí por qué se descarta (de 3 a 300 letras)." };
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`configurar-solicitud:${opts.solicitudId}`}))`;
      const pedido = await tx.auditLog.findUnique({
        where: { id: opts.solicitudId },
        select: { id: true, tenantId: true, action: true, entity: true, tenant: { select: { slug: true } } },
      });
      if (!pedido || pedido.action !== ACCION_SOLICITUD_ALTA || pedido.entity !== ENTIDAD_SOLICITUD) throw new Rechazo("Ese pedido no existe.");
      if (opts.estudioTenantId !== undefined && pedido.tenantId !== opts.estudioTenantId) throw new Rechazo("Ese pedido no existe.");
      if ((await cerrados(tx, [pedido.id])).has(pedido.id)) throw new Rechazo("Ese pedido ya estaba cerrado.");
      const g = decidirOperadorParaNegocios(opts.sesion, [pedido.tenant.slug]);
      if (!g.ok) throw new Rechazo(g.motivo);
      await enNegocio(tx, pedido.tenantId);
      await tx.auditLog.create({
        data: {
          tenantId: pedido.tenantId, actor: `operator:${opts.sesion.nombre}`, action: ACCION_SOLICITUD_DESCARTADA,
          entity: ENTIDAD_SOLICITUD, entityId: pedido.id, channel: "admin", changes: { motivo, operador: opts.sesion.nombre },
        },
        select: { id: true },
      });
      return { ok: true as const };
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    throw e;
  }
}
