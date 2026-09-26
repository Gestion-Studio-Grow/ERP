// ============================================================================
// CONFIGURADOR DE CLIENTES DE ESTUDIO (Soporte GSG) — el servidor.
// ============================================================================
//
// NO lleva "use server" (no es un endpoint): lo llama `actions.ts` después de la sesión de operador,
// y los tests lo ejecutan contra Postgres con el cliente del operador. Recibe la base por parámetro.
//
// CON RLS (la consola está sujeta a RLS en producción, ver operator-db.ts): el pedido, sus cierres,
// quién lo pidió y la cartera son filas del ESTUDIO. Todo se lee y se escribe parado en él: la
// bandeja recorre los estudios (negocios con la cartera) con `enElNegocio`, y configurar/descartar
// abren la transacción en el estudio del formulario. `Tenant` no tiene RLS y se lee directo.
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
import { enElNegocio } from "@/lib/operator-db";
import { provisionTenant } from "../../../../../scripts/provision-tenant";
import { generateStrongPassword, hashPassword } from "@/lib/auth-password";
import { MODULO_CARTERA, crearClienteProvisioning, resolverSlugCliente } from "@/lib/cartera-core";
import { mapaDeHostsVigente } from "@/lib/tenant";
import { leerLimitesEnTx } from "@/lib/limites-del-negocio-en-tx";
import { decidirAltaDeUsuarioEnTx } from "@/lib/usuarios-del-plan";
import { decidirAlta, NO_SE_PUDO_CONTAR } from "@/planes/limites";
import { suggestSlug } from "@/lib/provisioning/slug";
import { decidirAcceso, direccionDelLocal } from "@/lib/multilocal/multilocal-core";
import { decidirOperadorParaNegocios } from "@/lib/operador/guardia-negocio-core";
import { formatearCuit } from "@/lib/fiscal/cuit";
import { choqueDePuntoDeVenta } from "@/app/operador/(console)/tenants/[id]/candado-punto-venta";
import { leerPedidosAbiertos, type ClaveDePedido, type PedidoAbierto } from "@/lib/cartera-alta-db";
import {
  ACCION_NOTA_INTERNA_SOPORTE,
  MOTIVOS_DE_DESCARTE,
  MOTIVO_POR_DEFECTO,
  esMotivoDeDescarte,
  validarMotivoDeDescarte,
  validarNotaInterna,
  type MotivoDeDescarte,
} from "@/lib/soporte/avisos-a-la-contadora";
import { guardarRegimenFacturaAEnTx } from "@/lib/fiscal/regimen-factura-a.server";
import { seEmiteFueraDelSistema } from "@/lib/fiscal/regimen-factura-a";
import type { RegimenFacturaA } from "@/lib/fiscal/decidir-comprobante";
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
  avisoDeOtrosLocales,
  ACCION_ALTA_POR_SOPORTE,
  ACCION_CONFIGURADOR_ALTA,
  AVISO_POSIBLE_DUPLICADO,
  AVISO_VINCULO_SIN_AUTORIZACION,
  BLUEPRINT_DEL_RUBRO,
  YA_EN_LA_CARTERA,
  posiblesDuplicados,
  type PosibleDuplicado,
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
  /** Negocios que ya tienen ese CUIT en la plataforma (sólo para Soporte). `enCartera`: ya está en la de ESTE estudio. */
  yaExisten: { id: string; nombre: string; slug: string; puntoVenta: number | null; enCartera: boolean }[];
  /** Negocios SIN CUIT que pueden ser el mismo (nombre o dirección). Sólo para Soporte; vacío si el CUIT ya existe. */
  parecidos: PosibleDuplicado[];
}

/**
 * Los negocios SIN CUIT que pueden ser el del pedido (configurador-reglas.ts, posiblesDuplicados).
 * Nunca el propio estudio. Sólo lee `Tenant` (sin RLS): esto lo ve sólo Soporte.
 */
async function parecidosSinCuit(
  db: PrismaClient | Tx,
  pedido: { nombre: string; alias?: string | null },
  estudioId: string,
): Promise<PosibleDuplicado[]> {
  const sinCuit = await db.tenant.findMany({
    where: { id: { not: estudioId }, OR: [{ arcaCuit: null }, { arcaCuit: "" }] },
    orderBy: { createdAt: "asc" },
    take: 2000,
    select: { id: true, name: true, slug: true, subdomain: true },
  });
  return posiblesDuplicados(
    { nombre: pedido.nombre, alias: pedido.alias, slugSugerido: suggestSlug(pedido.nombre) },
    sinCuit.map((t) => ({ id: t.id, nombre: t.name, slug: t.slug, subdominio: t.subdomain })),
  );
}

export interface UsuarioEntregado {
  quien: "cliente" | "contadora";
  nombre: string;
  email: string;
  /** Contraseña temporal. `null`: ya tenía usuario ahí y conserva su contraseña. */
  clave: string | null;
}

// ── Bandeja ──────────────────────────────────────────────────────────────────

/** Los cierres de esos pedidos. `tx` parada en el estudio: el cierre va en su registro, como el pedido. */
async function cerrados(tx: Tx, estudioId: string, ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const filas = await tx.auditLog.findMany({
    where: { tenantId: estudioId, action: { in: [...ACCIONES_QUE_CIERRAN_LA_SOLICITUD] }, entity: ENTIDAD_SOLICITUD, entityId: { in: ids } },
    select: { entityId: true, changes: true },
  });
  return new Map(
    filas.map((f) => [f.entityId ?? "", ((f.changes as { clienteTenantId?: string } | null)?.clienteTenantId ?? null)]),
  );
}

/** Cuántos pedidos trae cada página de la bandeja. */
export const PEDIDOS_POR_PAGINA = 50;

/** Una página de la bandeja de Soporte. */
export interface PaginaDeSolicitudes {
  pedidos: SolicitudPendiente[];
  /** Todos los pedidos abiertos de todos los estudios, no sólo los de esta página. */
  total: number;
  /** Para pedir la página siguiente (el último pedido de ésta); `null` si no hay más. */
  siguiente: string | null;
}

/** Los estudios: los negocios con la cartera (los únicos que piden altas). `Tenant` no tiene RLS. */
async function idsDeLosEstudios(db: PrismaClient): Promise<string[]> {
  const filas = await db.tenant.findMany({ where: { modules: { has: MODULO_CARTERA } }, select: { id: true }, orderBy: { id: "asc" } });
  return filas.map((f) => f.id);
}

/** De qué estudio es un pedido de alta: se lo busca parado en cada uno (con RLS, desde afuera no se ve). */
async function ubicarPedido(db: PrismaClient, id: string): Promise<{ estudioId: string; clave: ClaveDePedido } | null> {
  for (const estudioId of await idsDeLosEstudios(db)) {
    const p = await enElNegocio(
      estudioId,
      (tx) =>
        tx.auditLog.findFirst({
          where: { id, tenantId: estudioId, action: ACCION_SOLICITUD_ALTA, entity: ENTIDAD_SOLICITUD },
          select: { id: true, createdAt: true },
        }),
      db,
    );
    if (p) return { estudioId, clave: { createdAt: p.createdAt, id: p.id } };
  }
  return null;
}

/** El orden de la bandeja: fecha y, a igual fecha, id (el mismo que `leerPedidosAbiertos`). */
function antes(a: ClaveDePedido, b: ClaveDePedido): number {
  const t = a.createdAt.getTime() - b.createdAt.getTime();
  return t !== 0 ? t : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Los pedidos ABIERTOS de todos los estudios, del más viejo al más nuevo, de a `limite`, después del
 * pedido `desde`. El «abierto», el orden y el total se resuelven en la base (cartera-alta-db.ts): antes
 * se traían los 500 pedidos más viejos, abiertos y cerrados, y del 501 en adelante no aparecía nada.
 * Con RLS, una página por estudio (parado en él), que se juntan acá: la página es la de todos.
 */
export async function listarSolicitudesPendientes(
  db: PrismaClient,
  opts: { desde?: string | null; limite?: number } = {},
): Promise<PaginaDeSolicitudes> {
  const limite = opts.limite ?? PEDIDOS_POR_PAGINA;
  const estudios = await idsDeLosEstudios(db);
  // `desde` es el id del último pedido de la página anterior: su clave se busca una vez.
  const cursor = opts.desde ? await ubicarPedido(db, opts.desde) : null;
  const porEstudio = await Promise.all(
    estudios.map((estudioTenantId) =>
      enElNegocio(estudioTenantId, (tx) => leerPedidosAbiertos(tx, { estudioTenantId, despuesDe: cursor?.clave ?? null, limite }), db),
    ),
  );
  const total = porEstudio.reduce((n, r) => n + r.total, 0);
  // Un `desde` que no es un pedido: nada después de él (como antes), con el total de todos.
  if (opts.desde && !cursor) return { pedidos: [], total, siguiente: null };
  const juntos = porEstudio.flatMap((r) => r.filas).sort(antes);
  const pagina = juntos.slice(0, limite);
  const hayMas = juntos.length > limite || porEstudio.some((r) => r.hayMas);
  // Cada pedido se arma parado en SU estudio (quién lo pidió, su WhatsApp, su cartera).
  const armados = new Map<string, SolicitudPendiente | null>();
  const deCadaEstudio = new Map<string, PedidoAbierto[]>();
  for (const p of pagina) deCadaEstudio.set(p.tenantId, [...(deCadaEstudio.get(p.tenantId) ?? []), p]);
  await Promise.all(
    [...deCadaEstudio].map(([estudioId, pedidos]) =>
      enElNegocio(
        estudioId,
        async (tx) => {
          for (const p of pedidos) armados.set(p.id, await armarSolicitud(tx, p));
        },
        db,
      ),
    ),
  );
  const pedidos = pagina.map((p) => armados.get(p.id)).filter((x): x is SolicitudPendiente => Boolean(x));
  return { pedidos, total, siguiente: hayMas && pagina.length > 0 ? pagina[pagina.length - 1].id : null };
}

/** Cómo se cerró un pedido: lo que ve Soporte al volver a abrirlo (y justo después de descartarlo). */
export type CierreDelPedido =
  | { tipo: "descartado"; motivo: MotivoDeDescarte; texto: string; nota: string | null; operador: string | null; cuando: string }
  | { tipo: "configurado"; clienteTenantId: string | null };

/** Un pedido por id (abierto o cerrado). `null` si no es un pedido de alta. Se lee parado en su estudio. */
export async function leerSolicitud(
  db: PrismaClient,
  id: string,
): Promise<(SolicitudPendiente & { cerrada: boolean; cierre: CierreDelPedido | null }) | null> {
  const ubicado = await ubicarPedido(db, id);
  if (!ubicado) return null;
  return enElNegocio(ubicado.estudioId, (tx) => leerSolicitudEnTx(tx, ubicado.estudioId, id), db);
}

async function leerSolicitudEnTx(
  tx: Tx,
  estudioId: string,
  id: string,
): Promise<(SolicitudPendiente & { cerrada: boolean; cierre: CierreDelPedido | null }) | null> {
  const p = await tx.auditLog.findFirst({
    where: { id, tenantId: estudioId },
    select: { id: true, tenantId: true, actor: true, changes: true, createdAt: true, action: true, entity: true },
  });
  if (!p || p.action !== ACCION_SOLICITUD_ALTA || p.entity !== ENTIDAD_SOLICITUD) return null;
  const s = await armarSolicitud(tx, p);
  if (!s) return null;
  const cierres = await cerrados(tx, estudioId, [id]);
  if (!cierres.has(id)) return { ...s, cerrada: false, cierre: null };
  const descarte = await tx.auditLog.findFirst({
    where: { tenantId: estudioId, action: ACCION_SOLICITUD_DESCARTADA, entity: ENTIDAD_SOLICITUD, entityId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true, changes: true },
  });
  if (!descarte) return { ...s, cerrada: true, cierre: { tipo: "configurado", clienteTenantId: cierres.get(id) ?? null } };
  const nota = await tx.auditLog.findFirst({
    where: { tenantId: estudioId, action: ACCION_NOTA_INTERNA_SOPORTE, entity: ENTIDAD_SOLICITUD, entityId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { changes: true },
  });
  const ch = descarte.changes as { motivoCodigo?: unknown; motivo?: unknown; operador?: unknown } | null;
  const motivo = esMotivoDeDescarte(ch?.motivoCodigo) ? ch.motivoCodigo : MOTIVO_POR_DEFECTO;
  const notaNueva = (nota?.changes as { nota?: unknown } | null)?.nota;
  // Un descarte de antes de la lista cerrada guardó el motivo escrito a mano: Soporte lo ve como nota interna.
  const notaVieja = typeof ch?.motivo === "string" ? ch.motivo : null;
  return {
    ...s,
    cerrada: true,
    cierre: {
      tipo: "descartado",
      motivo,
      texto: MOTIVOS_DE_DESCARTE[motivo],
      nota: typeof notaNueva === "string" ? notaNueva : notaVieja,
      operador: typeof ch?.operador === "string" ? ch.operador : null,
      cuando: descarte.createdAt.toISOString(),
    },
  };
}

/** `tx` parada en el estudio del pedido: quién lo pidió, su WhatsApp y su cartera son filas suyas. */
async function armarSolicitud(
  db: Tx,
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
  const enCartera = yaExisten.length
    ? new Set(
        (
          await db.carteraCliente.findMany({
            where: { tenantId: p.tenantId, clienteTenantId: { in: yaExisten.map((t) => t.id) }, estado: { not: "baja" } },
            select: { clienteTenantId: true },
          })
        ).map((f) => f.clienteTenantId),
      )
    : new Set<string>();
  const parecidos = yaExisten.length ? [] : await parecidosSinCuit(db, { nombre: datos.nombre, alias: datos.alias }, p.tenantId);
  return {
    id: p.id,
    creado: p.createdAt,
    estudio: { id: estudio.id, nombre: estudio.name, slug: estudio.slug, whatsapp: estudio.businessSettings?.whatsapp ?? null },
    pedidoPor: quien ? { nombre: quien.name, email: quien.email } : null,
    datos,
    yaExisten: yaExisten.map((t) => ({ id: t.id, nombre: t.name, slug: t.slug, puntoVenta: t.arcaPuntoVenta, enCartera: enCartera.has(t.id) })),
    parecidos,
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
    { mapaDeHosts: mapaDeHostsVigente({ ...env }), dominioPropio: env.APP_BASE_DOMAIN?.trim() || null },
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
      /** El pedido dice «varios locales»: «Pasale esto» se lo recuerda a Soporte y al dueño. */
      otrosLocales: boolean;
      /** «A con leyenda» o «M»: el sistema no las emite y «Pasale esto» se lo dice al dueño. */
      facturaAFuera: RegimenFacturaA | null;
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
  // El estudio del formulario (el que pasó la guardia): la transacción se para en él para leer el pedido.
  opts: { solicitudId: string; estudioTenantId: string; sesion: { nombre: string; esDuenio: boolean }; form: FormConfigurador },
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
        // Parada en el estudio del formulario: un pedido de otro estudio ni se ve (RLS), y además se exige el negocio.
        await enNegocio(tx, opts.estudioTenantId);
        const pedido = await tx.auditLog.findFirst({
          where: { id: opts.solicitudId, tenantId: opts.estudioTenantId },
          select: { id: true, tenantId: true, actor: true, action: true, entity: true, changes: true },
        });
        if (!pedido || pedido.action !== ACCION_SOLICITUD_ALTA || pedido.entity !== ENTIDAD_SOLICITUD) {
          throw new Rechazo("Ese pedido no existe.");
        }
        const estudioId = pedido.tenantId;
        // Lo que pidió la contadora (no lo que quedó en el formulario): ¿varios locales?
        const avisoLocales = avisoDeOtrosLocales(leerSolicitudGuardada(pedido.changes)?.tamanio);
        const estudio = await tx.tenant.findUnique({
          where: { id: estudioId },
          select: { id: true, slug: true, name: true, modules: true, arcaCuit: true, subdomain: true },
        });
        if (!estudio) throw new Rechazo("El estudio del pedido ya no existe.");
        const direccionCartera = direccionDe(estudio.subdomain, "/contador", env);
        const datosEstudio = { id: estudio.id, nombre: estudio.name, direccionCartera };

        // 2) Idempotencia: pedido ya cerrado → lo que quedó, sin crear nada ni mostrar claves.
        const previo = (await cerrados(tx, estudioId, [pedido.id])).get(pedido.id);
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
            pendientes: { condicionIva: false, cambioDeClave: false }, avisos: avisoLocales ? [avisoLocales] : [], otrosLocales: avisoLocales !== null,
            facturaAFuera: seEmiteFueraDelSistema(c.regimenFacturaA) ? c.regimenFacturaA : null,
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
        // 3b) Posible duplicado SIN CUIT (hallazgo QA 26/09): si el CUIT no está, puede estar el mismo
        //     negocio sin CUIT cargado. Soporte decide: «es otro» (se crea) o «es este» (se le carga el
        //     CUIT y se suma). Se recalcula acá, bajo el candado del CUIT: lo que vio la pantalla no manda.
        let cuitCargadoA: string | null = null;
        let parecidosDescartados: string[] = [];
        if (!existente) {
          const guardado = leerSolicitudGuardada(pedido.changes);
          const parecidos = await parecidosSinCuit(
            tx,
            { nombre: guardado?.nombre ?? c.razonSocial, alias: guardado?.alias ?? null },
            estudioId,
          );
          const d = c.duplicado;
          if (d.tipo === "es") {
            if (!parecidos.some((x) => x.id === d.tenantId)) {
              throw new Rechazo("Ese negocio ya no figura entre los parecidos sin CUIT (quizás ya se lo cargaron). Volvé a abrir el pedido.");
            }
            const elegido = await tx.tenant.findUnique({
              where: { id: d.tenantId },
              select: { id: true, name: true, slug: true, subdomain: true, arcaCuit: true, arcaPuntoVenta: true },
            });
            if (!elegido) throw new Rechazo("Ese negocio ya no existe. Volvé a abrir el pedido.");
            existente = elegido;
            cuitCargadoA = elegido.id;
          } else if (parecidos.length > 0) {
            if (d.tipo === "sin-decidir") throw new Rechazo(AVISO_POSIBLE_DUPLICADO);
            parecidosDescartados = parecidos.map((x) => x.id);
          }
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
        // Ya en la cartera de este estudio por su CUIT: no hay nada que sumar (el pedido se descarta).
        if (existente && !cuitCargadoA && filaCartera && filaCartera.estado !== "baja") throw new Rechazo(YA_EN_LA_CARTERA);
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
        const avisos: string[] = avisoLocales ? [avisoLocales] : [];
        const usuarios: UsuarioEntregado[] = [];
        let cliente: { id: string; name: string; slug: string; subdomain: string | null; arcaPuntoVenta: number | null };
        const creado = existente === null;
        const modulos = modulosDelAlta(c.plan, c.rubro);

        if (existente) {
          // 5a) Vincular, no duplicar: no se le toca plan, módulos, punto de venta, dirección ni usuarios.
          cliente = existente;
          if (cuitCargadoA) {
            // «Es este»: se le carga el CUIT (y el punto de venta si no tenía), sólo si sigue sin CUIT.
            await enNegocio(tx, existente.id);
            const puntoVenta = existente.arcaPuntoVenta ?? c.puntoVenta;
            const n = await tx.tenant.updateMany({
              where: { id: existente.id, OR: [{ arcaCuit: null }, { arcaCuit: "" }] },
              data: { arcaCuit: c.cuit, ...(existente.arcaPuntoVenta == null ? { arcaPuntoVenta: c.puntoVenta } : {}) },
            });
            if (n.count !== 1) throw new Rechazo("A ese negocio le cargaron un CUIT mientras tanto. Volvé a abrir el pedido.");
            cliente = { ...existente, arcaPuntoVenta: puntoVenta };
            avisos.push(
              `Se le cargó el CUIT ${formatearCuit(c.cuit) ?? c.cuit} a «${existente.name}»${filaCartera && filaCartera.estado !== "baja" ? " (ya estaba en la cartera de este estudio)" : " y se sumó a la cartera"}. Conservó su plan, sus apps y sus usuarios.`,
            );
          } else {
            avisos.push("Ese CUIT ya estaba en la plataforma: se sumó a la cartera y conservó su plan, sus apps y sus usuarios.");
          }
          if (existente.arcaPuntoVenta != null && existente.arcaPuntoVenta !== c.puntoVenta) {
            avisos.push(
              `Ese negocio ya factura con el punto de venta ${existente.arcaPuntoVenta}: no se cambió. Si está mal, se corrige desde su ficha.`,
            );
          }
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
              ...(cuitCargadoA ? { cuitCargado: true } : {}),
              ...(parecidosDescartados.length ? { parecidosDescartados } : {}),
              direccion: direccion ? "con-direccion" : "sin-direccion",
              usuarios: sinClaves.filter((u) => u.quien === "cliente"),
            },
          },
          select: { id: true },
        });
        // La Factura A que asignó ARCA (RG 1575), para todo Responsable Inscripto: sin ella la A, de
        // prueba o real, pasa por revisión (QA 26/09, vuelta 4, bloqueante 2). Mismo negocio, misma tx.
        if (c.regimenFacturaA) {
          await guardarRegimenFacturaAEnTx(tx, { tenantId: cliente.id, regimen: c.regimenFacturaA, operador, origen: "configurador", solicitudId: pedido.id });
        }
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
          otrosLocales: avisoLocales !== null,
          facturaAFuera: seEmiteFueraDelSistema(c.regimenFacturaA) ? c.regimenFacturaA : null,
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

/** Lo que devuelve el descarte: el motivo que ve la contadora, o el error con su campo. */
export type ResultadoDescarte =
  | { ok: true; motivo: MotivoDeDescarte }
  | { ok: false; error: string; campo?: "motivo" | "nota" };

/**
 * Soporte descarta un pedido (repetido, datos imposibles). Sale de la bandeja; queda en la auditoría del
 * estudio SÓLO el código del motivo, de una lista cerrada (soporte/avisos-a-la-contadora.ts): la contadora
 * nunca lee texto escrito por Soporte. La nota libre va en otra fila (ACCION_NOTA_INTERNA_SOPORTE), que
 * ninguna pantalla del negocio lee (ni la cartera ni la auditoría del panel).
 */
export async function descartarSolicitud(
  db: PrismaClient,
  opts: { solicitudId: string; estudioTenantId: string; sesion: { nombre: string; esDuenio: boolean }; motivo: unknown; nota?: unknown },
): Promise<ResultadoDescarte> {
  const vm = validarMotivoDeDescarte(opts.motivo);
  if (!vm.ok) return { ok: false, error: vm.error, campo: "motivo" };
  const vn = validarNotaInterna(opts.nota);
  if (!vn.ok) return { ok: false, error: vn.error, campo: "nota" };
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`configurar-solicitud:${opts.solicitudId}`}))`;
      // Parada en el estudio del formulario, como configurar.
      await enNegocio(tx, opts.estudioTenantId);
      const pedido = await tx.auditLog.findFirst({
        where: { id: opts.solicitudId, tenantId: opts.estudioTenantId },
        select: { id: true, tenantId: true, action: true, entity: true, tenant: { select: { slug: true } } },
      });
      if (!pedido || pedido.action !== ACCION_SOLICITUD_ALTA || pedido.entity !== ENTIDAD_SOLICITUD) throw new Rechazo("Ese pedido no existe.");
      if ((await cerrados(tx, pedido.tenantId, [pedido.id])).has(pedido.id)) throw new Rechazo("Ese pedido ya estaba cerrado.");
      const g = decidirOperadorParaNegocios(opts.sesion, [pedido.tenant.slug]);
      if (!g.ok) throw new Rechazo(g.motivo);
      const actor = `operator:${opts.sesion.nombre}`;
      await tx.auditLog.create({
        data: {
          tenantId: pedido.tenantId, actor, action: ACCION_SOLICITUD_DESCARTADA,
          entity: ENTIDAD_SOLICITUD, entityId: pedido.id, channel: "admin", changes: { motivoCodigo: vm.motivo, operador: opts.sesion.nombre },
        },
        select: { id: true },
      });
      if (vn.nota) {
        await tx.auditLog.create({
          data: {
            tenantId: pedido.tenantId, actor, action: ACCION_NOTA_INTERNA_SOPORTE,
            entity: ENTIDAD_SOLICITUD, entityId: pedido.id, channel: "admin", changes: { nota: vn.nota, operador: opts.sesion.nombre },
          },
          select: { id: true },
        });
      }
      return { ok: true as const, motivo: vm.motivo };
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.message };
    throw e;
  }
}
