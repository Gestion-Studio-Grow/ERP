// PROFETURNOS · Registrar un trámite de arrepentimiento o de baja (núcleo puro en
// src/lib/factoque-tramites.ts, producto PROFETURNOS). Separado de las server actions para probarlo
// contra Postgres sin la sesión de Next.
//
//  · Público (sin cuenta, Res. SCI 424/2020): busca el negocio ProfeTurnos (blueprint `profe-padel`)
//    por el usuario de su link (subdominio o slug; Tenant no tiene RLS, `basePrisma` como el ruteo) y
//    sólo REGISTRA en su AuditLog, dentro de SU transacción (RLS). Anota si el email coincide con un
//    usuario del negocio, para que GSG lo valide; no se cambia el plan de nadie por saber un link.
//  · Con sesión del profe: en su transacción, con candado por negocio, pasa por el ENGANCHE de T2
//    (`efectoDelTramite`) y deja la fila.

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { PROFETURNOS, type DatosTramiteProfeturnos, type Efecto, type TipoTramite } from "@/lib/factoque-tramites";
import { dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { dentroDelArrepentimiento } from "./plan-core";
import { ACCION_DEVOLUCION, ACCION_PAGO, ACCION_PLAN, planEnTx } from "./plan.server";

type TenantTx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/** Blueprint de los negocios ProfeTurnos (src/blueprints/oficios/rubros.ts). */
export const BLUEPRINT_PROFETURNOS = "profe-padel";

/**
 * ENGANCHE T2 (prueba gratis + abono MP, PLAN-SALIDA-2026-11 §5). Corre dentro de la transacción del
 * negocio, con el candado `profeturnos-plan:<tenantId>` ya tomado, y SÓLO por el camino con sesión
 * (el trámite público no cambia el plan de nadie por saber un link).
 *  · Arrepentimiento con un pago de los últimos `DIAS_ARREPENTIMIENTO` días: fila `profeturnos.plan`
 *    {plan: "vencido"} (panel en modo lectura, no se borra nada) y una fila `profeturnos.devolucion`
 *    por cada pago a devolver: GSG devuelve A MANO (no se automatiza). → «plan_a_gratis».
 *    Si esos pagos ya estaban marcados para devolver → «ya_era_gratis». Sin pago en plazo → «registrado».
 *  · Baja: no renueva y conserva lo pagado: fila `profeturnos.plan` {plan: "baja", vigenciaHasta igual}.
 *    → «registrado». Un negocio «libre» (sin alta web) no recibe filas de plan.
 */
async function efectoDelTramite(tx: TenantTx, tenantId: string, tipo: TipoTramite, numero: string): Promise<Efecto> {
  const hoy = todayInBusinessTz();
  const plan = await planEnTx(tx, tenantId, hoy);
  const por = PROFETURNOS.accion[tipo];
  if (tipo === "baja") {
    if (plan.estado === "libre") return "registrado";
    await tx.auditLog.create({
      data: {
        tenantId,
        actor: "sistema:profeturnos",
        action: ACCION_PLAN,
        entity: "Tenant",
        entityId: tenantId,
        changes: { plan: "baja", vigenciaHasta: plan.fila.vigenciaHasta, por, tramite: numero, antes: { ...plan.fila } },
        channel: "admin",
      },
    });
    return "registrado";
  }
  const pagos = await tx.auditLog.findMany({
    where: { tenantId, action: ACCION_PAGO, entity: "Pago" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { entityId: true, createdAt: true, changes: true },
    take: 20,
  });
  const enPlazo = pagos.filter((p) => p.entityId && dentroDelArrepentimiento(dateStrInBusinessTz(p.createdAt), hoy));
  if (!enPlazo.length) return "registrado";
  const yaMarcados = new Set(
    (
      await tx.auditLog.findMany({
        where: { tenantId, action: ACCION_DEVOLUCION, entity: "Pago", entityId: { in: enPlazo.map((p) => p.entityId as string) } },
        select: { entityId: true },
      })
    ).map((d) => d.entityId),
  );
  const aDevolver = enPlazo.filter((p) => !yaMarcados.has(p.entityId));
  if (!aDevolver.length) return "ya_era_gratis";
  await tx.auditLog.create({
    data: {
      tenantId,
      actor: "sistema:profeturnos",
      action: ACCION_PLAN,
      entity: "Tenant",
      entityId: tenantId,
      changes: { plan: "vencido", vigenciaHasta: null, por, tramite: numero, antes: { ...plan.fila } },
      channel: "admin",
    },
  });
  for (const p of aDevolver) {
    const monto = (p.changes as { monto?: unknown } | null)?.monto;
    await tx.auditLog.create({
      data: {
        tenantId,
        actor: "sistema:profeturnos",
        action: ACCION_DEVOLUCION,
        entity: "Pago",
        entityId: p.entityId,
        changes: { paymentId: p.entityId, monto: typeof monto === "number" ? monto : null, tramite: numero, estado: "devolver-a-mano" },
        channel: "admin",
      },
    });
  }
  // Aviso a GSG (monitor): hay plata para devolver a mano por Mercado Pago.
  logger.warn("monitor", "arrepentimiento de ProfeTurnos: devolver el abono a mano", {
    aviso: "profeturnos-devolucion",
    tramite: numero,
    pagos: aDevolver.map((p) => p.entityId),
  });
  return "plan_a_gratis";
}

export async function registrarTramiteProfeturnos(
  tipo: TipoTramite,
  numero: string,
  datos: DatosTramiteProfeturnos,
  sesion: { tenantId: string; userId: string },
): Promise<{ numero: string; efecto: Efecto; tenantId: string }> {
  const { tenantId, userId } = sesion;
  const efecto = await tenantTransaction(
    async (tx): Promise<Efecto> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`profeturnos-plan:${tenantId}`}))`;
      const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true } });
      if (t?.blueprintId !== BLUEPRINT_PROFETURNOS) throw new Error("El trámite es del producto ProfeTurnos.");
      const efecto = await efectoDelTramite(tx, tenantId, tipo, numero);
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: `user:${userId}`,
          action: PROFETURNOS.accion[tipo],
          entity: "Tenant",
          entityId: tenantId,
          changes: { tramite: numero, ...datos, efecto },
          channel: "admin",
        },
      });
      return efecto;
    },
    { tenantId },
  );
  return { numero, efecto, tenantId };
}

/**
 * Sin cuenta: sólo registra en el negocio ProfeTurnos de ese usuario. La acción lo llama con `after()`
 * (después de responder), así la respuesta no revela quién es cliente. Devuelve el negocio o null.
 */
export async function registrarTramiteProfeturnosPublico(tipo: TipoTramite, numero: string, datos: DatosTramiteProfeturnos): Promise<string | null> {
  const negocio = await basePrisma.tenant.findFirst({
    where: { blueprintId: BLUEPRINT_PROFETURNOS, OR: [{ subdomain: datos.usuario }, { slug: datos.usuario }] },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!negocio) {
    // Igual tiene número y el aviso a GSG: puede haber pagado sin haber terminado el alta.
    logger.info("profeturnos", "trámite público sin negocio con ese usuario", { tipo, numero });
    return null;
  }
  await tenantTransaction(
    async (tx) => {
      const usuario = await tx.user.findFirst({ where: { tenantId: negocio.id, email: datos.email, deletedAt: null }, select: { id: true } });
      await tx.auditLog.create({
        data: {
          tenantId: negocio.id,
          actor: `publico:${datos.email}`,
          action: PROFETURNOS.accion[tipo],
          entity: "Tenant",
          entityId: negocio.id,
          changes: { tramite: numero, ...datos, efecto: "registrado", emailCoincide: !!usuario },
          channel: "public",
        },
      });
    },
    { tenantId: negocio.id },
  );
  return negocio.id;
}
