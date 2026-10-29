"use server";

// ============================================================================
// CIERRE DEL MES — congelar y reabrir. Server actions.
// ============================================================================
//
// Cada export de este archivo es un endpoint. Por eso ninguno recibe un negocio: el negocio
// es SIEMPRE el de la sesión (`getCurrentTenantId`), y lo único que llega del formulario es
// el mes ("AAAA-MM", validado) y lo que la persona escribió. La guarda es la misma de la
// página (`requireAppAccion("cierre-del-mes")`: rol, módulo, rubro), que no redirige a mitad
// de un formulario: devuelve el mensaje.
//
// La fila de AuditLog del cierre NO es sólo bitácora: decide si el mes está congelado. Por
// eso sólo se escribe desde acá, después de volver a leer y validar todo en el servidor
// (nunca se confía en lo que la pantalla mostró), y la lectura ignora cualquier fila con
// otra acción (ver `estadoDesdeAuditoria`).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox, DEMO_WRITE_BLOCKED } from "@/lib/demo-sandbox";
import { AppNoDisponibleError, requireAppAccion } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { bordesDelMes, esMesKey, etiquetaDelMes, type MesKey } from "@/lib/libros/fecha-fiscal";
import { CIERRE_DIARIO_ACTION, CIERRE_DIARIO_ENTITY, lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import {
  nextDayKey,
  formatDayLabel,
  isDayKey,
  validarReabrirDia,
  CIERRE_DIARIO_REABIERTO_ACTION,
  REABRIR_DIA_ACTION,
} from "@/lib/caja/cierre-diario";
import { cierreMarker } from "@/lib/caja/cierre-marca";
import { requireCapability } from "@/lib/authz";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/session";
import {
  ACCION_CONGELAR,
  ACCION_REABRIR,
  CIERRE_MES_ENTITY,
  estadoDesdeAuditoria,
  evaluarPasos,
  pasosListos,
  pendientesAntesDeCongelar,
  validarCongelar,
  validarReabrir,
} from "./cierre-mes";
import { mayuscula } from "@/lib/texto";
import { hayMovimientosSinCerrar, leerAuditoriaCierre, leerHechosCierreMes, mesesCongeladosQueReabririaElDia } from "./lectura";

export type EstadoAccionCierre = { ok: true; mensaje: string } | { ok: false; error: string } | null;

const RUTA = "/admin/cierre-mes";

/** La guarda de la app, devuelta como mensaje en vez de tirar (un formulario no redirige). */
async function exigirApp(): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> {
  try {
    return { ok: true, user: await requireAppAccion("cierre-del-mes") };
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
}

function leerMes(formData: FormData): MesKey | null {
  const mes = String(formData.get("mes") ?? "").trim();
  return esMesKey(mes) ? mes : null;
}

/** Otra pestaña (o la contadora al mismo tiempo) cambió el estado entre la lectura y la escritura. */
class CambioDeEstadoError extends Error {}
/** Entró un movimiento de caja en un día sin cerrar entre la lectura y el congelado. */
class CajaConMovimientosError extends Error {}

export async function congelarMesAction(_prev: EstadoAccionCierre, formData: FormData): Promise<EstadoAccionCierre> {
  const guarda = await exigirApp();
  if (!guarda.ok) return guarda;
  if (isDemoSandbox()) return DEMO_WRITE_BLOCKED;
  const { user } = guarda;
  const mes = leerMes(formData);
  if (!mes) return { ok: false, error: "No se entendió qué mes cerrar. Volvé a abrir Cierre del mes y elegilo de nuevo." };

  const tenantId = await getCurrentTenantId();
  const negocio = await getNegocioApps(user.role);
  const ahora = new Date();
  const [hechos, filas] = await Promise.all([
    leerHechosCierreMes(prisma, tenantId, mes, { esMostrador: negocio.esMostrador }),
    leerAuditoriaCierre(prisma, tenantId, mes),
  ]);
  const estado = estadoDesdeAuditoria(filas);
  const pasos = evaluarPasos(hechos, estado);
  const v = validarCongelar({ mes, hoy: ahora, pasos, estado, confirmaPendientes: formData.get("confirmo") === "1" });
  if (!v.ok) return v;

  try {
    await tenantTransaction(
      async (tx) => {
        // Se vuelve a mirar adentro de la transacción, con candado por negocio y mes: dos "Congelar"
        // simultáneos (doble clic, dos pestañas) no dejan dos congelados ni dos cierres de caja.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre-mes:${tenantId}:${mes}`}))`;
        // Y el candado de la caja del día (el mismo que toman cerrarDia, reabrirDiaAction y la apertura),
        // siempre DESPUÉS del del mes (nadie toma los dos en el otro orden: sin abrazo mortal). Congelar
        // lee la frontera y reabrir el día la mueve: sin esto, las dos a la vez confirmaban y quedaba un
        // mes congelado con la frontera antes de él (cert M1 F5). El candado sólo no alcanza: la
        // transacción de reabrir saca su foto ANTES de esperarlo; por eso esto corre en Serializable y el
        // ciclo lectura↔escritura aborta a una, que en el reintento ve a la otra ya confirmada.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre-dia:${tenantId}`}))`;
        if (estadoDesdeAuditoria(await leerAuditoriaCierre(tx, tenantId, mes)).congelado) throw new CambioDeEstadoError();
        // Días sin cerrar SIN movimientos (QA 26/09, vuelta 4): el congelado los cierra acá, en la misma
        // transacción, con la fila que ES la frontera de la caja (frontera-cierre.ts). Así un gasto con
        // fecha del mes se sigue rechazando después de congelar. Si hay movimientos, no se cierra nada.
        const bordes = bordesDelMes(mes);
        const cerradoHasta = await lastClosedDayTx(tx, tenantId);
        if (!cerradoHasta || cerradoHasta < bordes.ultimoDia) {
          if (await hayMovimientosSinCerrar(tx, tenantId, cerradoHasta, bordes.instantes.lt)) throw new CajaConMovimientosError();
          await tx.auditLog.create({
            data: {
              tenantId,
              actor: `user:${user.id}`,
              action: CIERRE_DIARIO_ACTION,
              entity: CIERRE_DIARIO_ENTITY,
              entityId: bordes.ultimoDia,
              channel: "admin",
              changes: {
                day: bordes.ultimoDia,
                since: cerradoHasta ? nextDayKey(cerradoHasta) : null,
                movimientos: 0,
                ajustes: 0,
                note: `Cerrado al congelar ${etiquetaDelMes(mes)}: no hubo movimientos de caja.`,
                alCongelarElMes: mes,
              },
            },
          });
        }
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: `user:${user.id}`,
            action: ACCION_CONGELAR,
            entity: CIERRE_MES_ENTITY,
            entityId: mes,
            changes: {
              por: user.name,
              listos: pasosListos(pasos),
              pendientes: pendientesAntesDeCongelar(pasos).map((p) => p.titulo),
            },
            channel: "admin",
          },
        });
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (e instanceof CambioDeEstadoError) return { ok: false, error: `${mayuscula(etiquetaDelMes(mes))} ya estaba congelado. Actualizá la página.` };
    if (e instanceof CajaConMovimientosError) {
      return { ok: false, error: "Entró un movimiento de caja en un día sin cerrar. Cerrá la caja de ese día y volvé a congelar." };
    }
    throw e;
  }

  revalidatePath(RUTA);
  revalidatePath("/admin");
  return { ok: true, mensaje: `${mayuscula(etiquetaDelMes(mes))} quedó congelado. Ahora descargá el paquete para tu contador.` };
}

export async function reabrirMesAction(_prev: EstadoAccionCierre, formData: FormData): Promise<EstadoAccionCierre> {
  const guarda = await exigirApp();
  if (!guarda.ok) return guarda;
  if (isDemoSandbox()) return DEMO_WRITE_BLOCKED;
  const { user } = guarda;
  const mes = leerMes(formData);
  if (!mes) return { ok: false, error: "No se entendió qué mes reabrir. Volvé a abrir Cierre del mes y elegilo de nuevo." };
  const motivo = String(formData.get("motivo") ?? "").trim().slice(0, 500);

  const tenantId = await getCurrentTenantId();
  const estado = estadoDesdeAuditoria(await leerAuditoriaCierre(prisma, tenantId, mes));
  const v = validarReabrir({ mes, estado, role: user.role, motivo });
  if (!v.ok) return v;

  try {
    await tenantTransaction(
      async (tx) => {
        if (!estadoDesdeAuditoria(await leerAuditoriaCierre(tx, tenantId, mes)).congelado) throw new CambioDeEstadoError();
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: `user:${user.id}`,
            action: ACCION_REABRIR,
            entity: CIERRE_MES_ENTITY,
            entityId: mes,
            changes: { por: user.name, motivo },
            channel: "admin",
          },
        });
      },
      { tenantId },
    );
  } catch (e) {
    if (e instanceof CambioDeEstadoError) return { ok: false, error: `${mayuscula(etiquetaDelMes(mes))} ya estaba abierto. Actualizá la página.` };
    throw e;
  }

  revalidatePath(RUTA);
  revalidatePath("/admin");
  return {
    ok: true,
    mensaje: `${mayuscula(etiquetaDelMes(mes))} quedó abierto. La caja sigue cerrada día por día: lo que corrijas de plata va con la fecha de hoy.`,
  };
}

// ============================================================================
// REABRIR EL DÍA (N2 · M1-C7) — la única pieza de la caja que vive en este archivo.
// ============================================================================
//
// Un día cerrado se reabre cuando apareció algo que tenía que entrar ESE día (la venta del
// cuaderno, la rendición del cadete). Reglas (`validarReabrirDia`, cierre-diario.ts): sólo la dueña
// o el dueño, con motivo, sólo el ÚLTIMO día cerrado y nunca un día de un mes congelado — el mes
// cerrado es del contador y se reabre desde Cierre del mes, no desde la caja.
//
// QUÉ HACE, en UNA transacción Serializable con candado por negocio:
//   · la fila del cierre de ese día pasa a `caja.cierre-diario.reabierto`: la frontera
//     (frontera-cierre.ts) ya no la cuenta y el día vuelve a aceptar movimientos. La fila queda
//     (con lo que se contó): es la historia;
//   · los ajustes que ese cierre había asentado (`cierre-diario:<día>`) se quitan del libro: el día
//     vuelve a como estaba antes de cerrarlo, y al cerrarlo de nuevo la diferencia se calcula una
//     vez, contra lo que haya. Lo quitado queda escrito, peso por peso, en la fila de auditoría;
//   · una fila de auditoría `caja.reabrir-dia` con quién, el motivo y lo quitado (Auditoría la
//     cuenta como «Reabrió la caja del …»).
// Cerrar el día de nuevo (`cerrarDia`) vuelve a congelarlo con una fila de cierre nueva.

class DiaYaAbiertoError extends Error {}

export async function reabrirDiaAction(_prev: EstadoAccionCierre, formData: FormData): Promise<EstadoAccionCierre> {
  const user = await requireCapability("orders:manage");
  if (isDemoSandbox()) return DEMO_WRITE_BLOCKED;
  const day = String(formData.get("day") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!isDayKey(day)) return { ok: false, error: "No se entendió qué día reabrir. Volvé a abrir el cierre y elegilo de nuevo." };
  if (user.role !== "OWNER") return { ok: false, error: "Sólo la dueña o el dueño puede reabrir un día cerrado." };

  const tenantId = await getCurrentTenantId();
  let quitados: { tipo: string; medio: string; monto: number; detalle: string | null }[] = [];
  try {
    const r = await tenantTransaction(
      async (tx) => {
        // Dos «Reabrir» a la vez (doble toque, dos pestañas) o un cierre en paralelo: uno espera al otro.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre-dia:${tenantId}`}))`;
        const [ultimoCerrado, cierreDelDia, congelados] = await Promise.all([
          lastClosedDayTx(tx, tenantId),
          tx.auditLog.findFirst({
            where: { tenantId, entity: CIERRE_DIARIO_ENTITY, action: CIERRE_DIARIO_ACTION, entityId: day },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          }),
          mesesCongeladosQueReabririaElDia(tx, tenantId, day),
        ]);
        if (!ultimoCerrado || day > ultimoCerrado) throw new DiaYaAbiertoError();
        const anteriorCongelado = congelados.find((m) => m !== day.slice(0, 7));
        const v = validarReabrirDia({
          day,
          role: user.role,
          motivo,
          ultimoCerrado,
          hayCierreDelDia: cierreDelDia !== null,
          mesCongelado: congelados.includes(day.slice(0, 7)),
          mesCongeladoQueCubre: anteriorCongelado ? etiquetaDelMes(anteriorCongelado) : null,
        });
        if (!v.ok) return v;

        const ajustes = await tx.cashMovement.findMany({
          where: { tenantId, createdBy: cierreMarker(day) },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          select: { id: true, type: true, method: true, amount: true, reason: true },
        });
        if (ajustes.length > 0) {
          const borrados = await tx.cashMovement.deleteMany({ where: { tenantId, id: { in: ajustes.map((a) => a.id) } } });
          if (borrados.count !== ajustes.length) throw new Error(`se esperaban ${ajustes.length} ajustes y se quitaron ${borrados.count}`);
        }
        await tx.auditLog.updateMany({
          where: { tenantId, entity: CIERRE_DIARIO_ENTITY, action: CIERRE_DIARIO_ACTION, entityId: day },
          data: { action: CIERRE_DIARIO_REABIERTO_ACTION },
        });
        const lista = ajustes.map((a) => ({ tipo: a.type, medio: a.method, monto: a.amount, detalle: a.reason }));
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: `user:${user.id}`,
            action: REABRIR_DIA_ACTION,
            entity: CIERRE_DIARIO_ENTITY,
            entityId: day,
            channel: "admin",
            changes: { day, por: user.name, motivo, ajustesQuitados: lista },
          },
        });
        return { ok: true as const, lista };
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (!r.ok) return r;
    quitados = r.lista;
  } catch (e) {
    if (e instanceof DiaYaAbiertoError) return { ok: false, error: `El ${formatDayLabel(day)} ya está abierto. Actualizá la página.` };
    throw e;
  }

  revalidatePath("/admin/caja/cierre");
  revalidatePath("/admin/caja/libro");
  revalidatePath("/admin/caja");
  const cola = quitados.length === 0 ? "" : ` Se quitaron ${quitados.length === 1 ? "el ajuste" : `los ${quitados.length} ajustes`} de ese cierre; al cerrarlo de nuevo se vuelve a contar.`;
  return { ok: true, mensaje: `El ${formatDayLabel(day)} quedó abierto: cargá lo que faltaba y cerralo de nuevo.${cola}` };
}
