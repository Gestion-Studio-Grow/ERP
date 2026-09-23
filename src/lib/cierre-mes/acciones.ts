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
import { esMesKey, etiquetaDelMes, type MesKey } from "@/lib/libros/fecha-fiscal";
import type { SessionUser } from "@/lib/session";
import {
  ACCION_CONGELAR,
  ACCION_REABRIR,
  CIERRE_MES_ENTITY,
  capitalizar,
  estadoDesdeAuditoria,
  evaluarPasos,
  pasosListos,
  pendientesAntesDeCongelar,
  validarCongelar,
  validarReabrir,
} from "./cierre-mes";
import { leerAuditoriaCierre, leerHechosCierreMes } from "./lectura";

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
        // Se vuelve a mirar adentro de la transacción: dos "Congelar" seguidos no dejan dos filas.
        if (estadoDesdeAuditoria(await leerAuditoriaCierre(tx, tenantId, mes)).congelado) throw new CambioDeEstadoError();
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
      { tenantId },
    );
  } catch (e) {
    if (e instanceof CambioDeEstadoError) return { ok: false, error: `${capitalizar(etiquetaDelMes(mes))} ya estaba congelado. Actualizá la página.` };
    throw e;
  }

  revalidatePath(RUTA);
  revalidatePath("/admin");
  return { ok: true, mensaje: `${capitalizar(etiquetaDelMes(mes))} quedó congelado. Ahora descargá el paquete para tu contador.` };
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
    if (e instanceof CambioDeEstadoError) return { ok: false, error: `${capitalizar(etiquetaDelMes(mes))} ya estaba abierto. Actualizá la página.` };
    throw e;
  }

  revalidatePath(RUTA);
  revalidatePath("/admin");
  return {
    ok: true,
    mensaje: `${capitalizar(etiquetaDelMes(mes))} quedó abierto. La caja sigue cerrada día por día: lo que corrijas de plata va con la fecha de hoy.`,
  };
}
